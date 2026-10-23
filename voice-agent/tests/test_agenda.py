import base64
import json
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from zunqoo_voice.agenda.service import AgendaError, book, find_slots, send_day_before_reminders
from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import (
    Appointment,
    AppointmentSettings,
    Approval,
    Contact,
    MailAccount,
    User,
    session_scope,
)
from zunqoo_voice.crm.modules import Autonomy, ModuleKey
from zunqoo_voice.crm.services import set_modules
from zunqoo_voice.mail.account import _ACCESS
from zunqoo_voice.mail.appointments import AppointmentChoice
from zunqoo_voice.mail.crypto import encrypt, generate_key
from zunqoo_voice.mail.processor import sync_tenant
from zunqoo_voice.mail.triage import MailDraft, MailTriage

PARIS = ZoneInfo("Europe/Paris")
CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
SCOPES = "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events"


class FakeCalendar:
    """Google Agenda simulé : garde les événements créés, comme le vrai."""

    def __init__(self, respx_mock, existing=()):
        self.events = {f"ext{i}": e for i, e in enumerate(existing)}
        respx_mock.get(CAL).mock(side_effect=self.list)
        respx_mock.post(CAL).mock(side_effect=self.create)
        respx_mock.patch(url__regex=rf"{CAL}/\w+").mock(side_effect=self.patch)
        respx_mock.delete(url__regex=rf"{CAL}/\w+").mock(side_effect=self.delete)

    def list(self, request):
        return httpx.Response(200, json={"items": list(self.events.values())})

    def create(self, request):
        body = json.loads(request.content)
        eid = f"ev{len(self.events)}"
        self.events[eid] = {**body, "id": eid}
        return httpx.Response(200, json={"id": eid})

    def patch(self, request):
        eid = request.url.path.rsplit("/", 1)[-1]
        self.events[eid].update(json.loads(request.content))
        return httpx.Response(200, json=self.events[eid])

    def delete(self, request):
        self.events.pop(request.url.path.rsplit("/", 1)[-1], None)
        return httpx.Response(204)


@pytest.fixture
def ag(tmp_path, tenant, respx_mock):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, mail_token_key=generate_key(),
                 google_client_id="c", google_client_secret="s",
                 whatsapp_access_token="WA", whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    every_day = {d: [["09:00", "12:00"]] for d in
                 ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")}
    with session_scope(s.database_url) as db:
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
        db.add(MailAccount(tenant_id=tenant.id, email="boutique@gmail.com", scopes=SCOPES,
                           refresh_token_enc=encrypt(s, "r"),
                           connected_at=datetime(2026, 1, 1, tzinfo=UTC)))
        db.add(AppointmentSettings(tenant_id=tenant.id, weekly=every_day, buffer_min=0,
                                   min_notice_hours=1, horizon_days=10, step_min=60,
                                   types=[{"id": "degust", "name": "Dégustation", "duration": 60}]))
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.EMAIL, ModuleKey.APPOINTMENTS},
                    {ModuleKey.EMAIL: Autonomy.VALIDATE_IMPORTANT,
                     ModuleKey.APPOINTMENTS: Autonomy.VALIDATE_IMPORTANT})
    respx_mock.post("https://oauth2.googleapis.com/token").respond(200, json={"access_token": "a"})
    respx_mock.post("https://graph.facebook.com/v21.0/PNID/messages").respond(
        200, json={"messages": [{"id": "w"}]})
    _ACCESS.clear()
    app.dependency_overrides[get_settings] = lambda: s
    yield s
    app.dependency_overrides.clear()


def tomorrow_at(hour):
    d = (datetime.now(PARIS) + timedelta(days=1)).date()
    return datetime(d.year, d.month, d.day, hour, tzinfo=PARIS)


async def test_slots_skip_google_events_and_double_booking(ag, tenant, respx_mock):
    busy = {"start": {"dateTime": tomorrow_at(10).isoformat()},
            "end": {"dateTime": tomorrow_at(11).isoformat()}}
    free = {"start": {"dateTime": tomorrow_at(9).isoformat()},
            "end": {"dateTime": tomorrow_at(10).isoformat()}, "transparency": "transparent"}
    cal = FakeCalendar(respx_mock, [busy, free])
    with session_scope(ag.database_url) as db:
        _, slots = await find_slots(db, ag, tenant, on_day=tomorrow_at(9).date())
        assert [s.hour for s in slots] == [9, 11]  # 10h occupé ; « disponible » ignoré
        contact = Contact(tenant_id=tenant.id, first_name="Léa", email="lea@ex.fr")
        db.add(contact)
        appt = await book(db, ag, tenant, type_ref="dégustation", start=tomorrow_at(11),
                          contact=contact, source="appel", confirmed=False)
        assert appt.status == "a_confirmer" and appt.type_name == "Dégustation"
        created = cal.events[appt.google_event_id]
        assert created["status"] == "tentative" and created["summary"].startswith("[À confirmer]")
        with pytest.raises(AgendaError, match="plus disponible"):
            await book(db, ag, tenant, type_ref=None, start=tomorrow_at(11), contact=contact,
                       source="appel")


async def test_confirmation_and_refusal_update_google(ag, tenant, respx_mock):
    cal = FakeCalendar(respx_mock)
    respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "m"})
    with session_scope(ag.database_url) as db:
        contact = Contact(tenant_id=tenant.id, first_name="Léa", email="lea@ex.fr")
        db.add(contact)
        a1 = await book(db, ag, tenant, type_ref=None, start=tomorrow_at(9), contact=contact,
                        source="appel", confirmed=False)
        a2 = await book(db, ag, tenant, type_ref=None, start=tomorrow_at(11), contact=contact,
                        source="appel", confirmed=False)
        from zunqoo_voice.crm.services import create_approval
        ap1 = create_approval(db, tenant_id=tenant.id, module=ModuleKey.APPOINTMENTS,
                              kind="rdv_confirmation", title="t", summary="s",
                              payload={"appointment_id": a1.id})
        ap2 = create_approval(db, tenant_id=tenant.id, module=ModuleKey.APPOINTMENTS,
                              kind="rdv_confirmation", title="t", summary="s",
                              payload={"appointment_id": a2.id})
        ids = (a1.id, a2.id, a1.google_event_id, a2.google_event_id, ap1.id, ap2.id)
    client = TestClient(app)
    tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                               "password": "motdepasse-solide"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    ok = client.post(f"/api/approvals/{ids[4]}/decision", json={"approve": True}, headers=h).json()
    assert ok["status"] == "execute" and "prévenu par e-mail" in ok["result"]
    no = client.post(f"/api/approvals/{ids[5]}/decision", json={"approve": False}, headers=h).json()
    assert no["status"] == "refuse" and "libéré" in no["result"]
    assert cal.events[ids[2]]["status"] == "confirmed" and ids[3] not in cal.events
    with session_scope(ag.database_url) as db:
        assert db.get(Appointment, ids[0]).status == "confirme"
        assert db.get(Appointment, ids[1]).status == "annule"


def _mail(mid, thread, text):
    data = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
    return {"id": mid, "threadId": thread, "internalDate": str(int(datetime.now(UTC).timestamp() * 1000)),
            "payload": {"mimeType": "text/plain", "body": {"data": data}, "headers": [
                {"name": "From", "value": "Léa Martin <lea@ex.fr>"},
                {"name": "Subject", "value": "Rendez-vous dégustation"},
                {"name": "Message-ID", "value": f"<{mid}@x>"}]}}


class RdvLLM:
    def __init__(self):
        self.instructions = []

    async def extract(self, schema, *, system, user, effort, purpose):
        if schema is MailTriage:
            return MailTriage(category="rendez_vous", importance="normale", needs_reply=True,
                              summary="Souhaite une dégustation.", must_escalate=False,
                              suspicious=False, customer_first_name="Léa")
        if schema is AppointmentChoice:
            if "le deuxième" in user.lower():
                return AppointmentChoice(action="choisit", choice_index=2)
            return AppointmentChoice(action="nouvelle_demande", appointment_type="Dégustation")
        assert schema is MailDraft
        self.instructions.append(user.split("CONSIGNE POUR CETTE RÉPONSE :")[1].split("<<<")[0])
        return MailDraft(body="Bonjour Léa, …", commits=True, confidence="haute")


async def test_email_offer_then_booking_in_same_thread(ag, tenant, respx_mock):
    cal = FakeCalendar(respx_mock)
    respx_mock.get(f"{GMAIL}/labels").respond(200, json={"labels": [{"id": "L", "name": "Zunqoo"}]})
    respx_mock.post(url__regex=rf"{GMAIL}/messages/\w+/modify").respond(200, json={})
    send = respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "s"})
    listing = respx_mock.get(f"{GMAIL}/messages").respond(200, json={"messages": [{"id": "m1"}]})
    respx_mock.get(f"{GMAIL}/messages/m1").respond(200, json=_mail("m1", "T", "Bonjour, une dégustation ?"))
    llm = RdvLLM()

    r1 = await sync_tenant(ag, tenant, llm=llm)
    assert r1.to_validate == 1 and not send.called  # propose des créneaux : engage une date
    assert llm.instructions[0].count("\n- ") == 3   # trois créneaux réels dans la consigne
    with session_scope(ag.database_url) as db:
        approval = db.query(Approval).one()
        offered = approval.payload["appt_offer"]["offered_slots"]
        assert len(offered) == 3 and approval.payload["appt_offer"]["thread_id"] == "T"
        approval_id = approval.id
    client = TestClient(app)
    tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                               "password": "motdepasse-solide"}).json()["token"]
    client.post(f"/api/approvals/{approval_id}/decision", json={"approve": True},
                headers={"Authorization": f"Bearer {tok}"})
    assert send.call_count == 1

    # Le client répond dans le même fil et choisit le deuxième créneau.
    listing.respond(200, json={"messages": [{"id": "m2"}]})
    respx_mock.get(f"{GMAIL}/messages/m2").respond(200, json=_mail("m2", "T", "Le deuxième me va !"))
    r2 = await sync_tenant(ag, tenant, llm=llm)
    assert r2.auto_sent == 1 and send.call_count == 2
    assert "a choisi le créneau" in llm.instructions[-1]
    with session_scope(ag.database_url) as db:
        appt = db.query(Appointment).one()
        assert appt.status == "confirme" and appt.source == "email"
        assert appt.start.replace(tzinfo=appt.start.tzinfo or UTC) == datetime.fromisoformat(offered[1])
    assert len(cal.events) == 1


async def test_day_before_reminder(ag, tenant, respx_mock):
    FakeCalendar(respx_mock)
    send = respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "m"})
    with session_scope(ag.database_url) as db:
        contact = Contact(tenant_id=tenant.id, first_name="Léa", email="lea@ex.fr")
        db.add(contact)
        await book(db, ag, tenant, type_ref=None, start=tomorrow_at(9), contact=contact,
                   source="appel")
    with session_scope(ag.database_url) as db:
        assert await send_day_before_reminders(db, ag, tenant, datetime.now(UTC)) == 1
        assert await send_day_before_reminders(db, ag, tenant, datetime.now(UTC)) == 0
    assert send.call_count == 1


def test_settings_validation_api(ag):
    client = TestClient(app)
    tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                               "password": "motdepasse-solide"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.patch("/api/agenda/settings", headers=h,
                        json={"weekly": {"lundi": [["14:00", "09:00"]]}}).status_code == 422
    assert client.patch("/api/agenda/settings", headers=h, json={"types": []}).status_code == 400
    ok = client.patch("/api/agenda/settings", headers=h, json={
        "types": [{"id": "coupe", "name": "Coupe", "duration": 30}],
        "weekly": {"mardi": [["09:00", "12:00"], ["14:00", "18:30"]]}}).json()
    assert ok["types"][0]["name"] == "Coupe" and ok["weekly"]["mardi"][1] == ["14:00", "18:30"]
