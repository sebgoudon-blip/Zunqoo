import base64
import json
from datetime import UTC, datetime, timedelta
from email import message_from_bytes
from email.policy import default
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.approvals import decide
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import (
    Appointment,
    Approval,
    Contact,
    ExtrasSettings,
    Interaction,
    MailAccount,
    ReviewRequest,
    User,
    session_scope,
)
from zunqoo_voice.crm.modules import Autonomy, ModuleKey
from zunqoo_voice.crm.services import set_modules
from zunqoo_voice.extras.reviews import schedule_review_requests
from zunqoo_voice.extras.summary import build_summary, send_due_summary
from zunqoo_voice.mail.account import _ACCESS
from zunqoo_voice.mail.crypto import encrypt, generate_key

PARIS = ZoneInfo("Europe/Paris")
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
WA = "https://graph.facebook.com/v21.0/PNID/messages"
LINK = "https://g.page/r/CocoricoTest/review"


@pytest.fixture
def ex(tmp_path, tenant, respx_mock):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, mail_token_key=generate_key(),
                 google_client_id="c", google_client_secret="s", crm_public_url="https://crm.test",
                 whatsapp_access_token="WA", whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    with session_scope(s.database_url) as db:
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
        db.add(MailAccount(tenant_id=tenant.id, email="boutique@gmail.com",
                           scopes="openid email https://www.googleapis.com/auth/gmail.modify",
                           refresh_token_enc=encrypt(s, "r"),
                           connected_at=datetime(2026, 1, 1, tzinfo=UTC)))
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.ORDERS, ModuleKey.APPOINTMENTS,
                                    ModuleKey.DAILY_SUMMARY, ModuleKey.REVIEWS})
        db.add(ExtrasSettings(tenant_id=tenant.id, review_link=LINK))
    respx_mock.post("https://oauth2.googleapis.com/token").respond(200, json={"access_token": "a"})
    _ACCESS.clear()
    app.dependency_overrides[get_settings] = lambda: s
    yield s
    app.dependency_overrides.clear()


def _order(db, tenant, contact, *, at, handled_at=None, day="demain"):
    data = {"report": {"intent": "commande", "summary": "Commande",
                       "order_lines": [{"product": "Poulet rôti", "quantity": 2}],
                       "requested_day": day}}
    if handled_at:
        data["handled_at"] = handled_at.isoformat()
    i = Interaction(tenant_id=tenant.id, contact=contact, channel="appel", intent="commande",
                    title="Commande", data=data, occurred_at=at)
    db.add(i)
    db.flush()
    return i


def test_summary_lists_day_todo_and_tomorrow(ex, tenant):
    now = datetime.now(PARIS).replace(hour=19, minute=0, second=0, microsecond=0)
    with session_scope(ex.database_url) as db:
        lea = Contact(tenant_id=tenant.id, first_name="Léa", last_name="Martin")
        db.add(lea)
        _order(db, tenant, lea, at=now - timedelta(hours=3))
        tomorrow = (now + timedelta(days=1)).replace(hour=10)
        db.add(Appointment(tenant_id=tenant.id, contact=lea, type_id="t", type_name="Traiteur",
                           start=tomorrow, end=tomorrow + timedelta(minutes=30)))
        db.add(Approval(tenant_id=tenant.id, module="emails", kind="email_reponse", title="t",
                        summary="s", payload={}))
    with session_scope(ex.database_url) as db:
        s = build_summary(db, ex, tenant, now)
    text = s.text(tenant.profile.name)
    assert "1 appel, dont 1 commande" in text
    assert "1 élément à valider" in text
    assert "1 commande : 2 Poulet rôti" in text
    assert "10:00 Léa Martin — Traiteur" in text
    assert text.endswith("https://crm.test")
    assert all("\n" not in p for p in s.template_params())  # contrainte Meta


async def test_summary_sent_once_at_chosen_time(ex, tenant, respx_mock):
    wa = respx_mock.post(WA).respond(200, json={"messages": [{"id": "w"}]})
    day = datetime(2026, 10, 22, tzinfo=PARIS)  # jeudi
    with session_scope(ex.database_url) as db:
        assert not await send_due_summary(db, ex, tenant, day.replace(hour=18, minute=59))
        assert await send_due_summary(db, ex, tenant, day.replace(hour=19, minute=2))
        assert not await send_due_summary(db, ex, tenant, day.replace(hour=21))
        db.get(ExtrasSettings, tenant.id).summary_days = [0, 1, 2, 4, 5, 6]  # pas le jeudi
        assert not await send_due_summary(db, ex, tenant, (day + timedelta(days=7)).replace(hour=20))
    assert wa.call_count == 1
    sent = json.loads(wa.calls[0].request.content)
    assert sent["template"]["name"] == "zunqoo_resume_soir"


async def test_review_requested_once_with_validation(ex, tenant, respx_mock):
    send = respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "m"})
    respx_mock.post(WA).respond(200, json={"messages": [{"id": "w"}]})
    now = datetime.now(UTC)
    with session_scope(ex.database_url) as db:
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.ORDERS, ModuleKey.REVIEWS},
                    {ModuleKey.REVIEWS: Autonomy.VALIDATE_ALL})
        lea = Contact(tenant_id=tenant.id, first_name="Léa", email="lea@ex.fr")
        sans = Contact(tenant_id=tenant.id, first_name="Marc", phone="+33600000000")
        db.add_all([lea, sans])
        _order(db, tenant, lea, at=now - timedelta(hours=40), handled_at=now - timedelta(hours=30))
        _order(db, tenant, lea, at=now - timedelta(hours=39), handled_at=now - timedelta(hours=29))
        _order(db, tenant, sans, at=now - timedelta(hours=40), handled_at=now - timedelta(hours=30))
        _order(db, tenant, lea, at=now - timedelta(hours=5), handled_at=now - timedelta(hours=2))
    with session_scope(ex.database_url) as db:
        assert await schedule_review_requests(db, ex, tenant, now) == 1
        assert await schedule_review_requests(db, ex, tenant, now) == 0
        statuses = sorted(r.status for r in db.query(ReviewRequest))
        assert statuses == ["a_valider", "deja_demande", "sans_email"]  # la récente attend le délai
        approval = db.query(Approval).filter_by(kind="avis_demande").one()
        assert LINK in approval.payload["body"] and "Bonjour Léa" in approval.payload["body"]
    assert send.call_count == 0  # rien ne part sans accord
    with session_scope(ex.database_url) as db:
        await decide(db, ex, tenant_id=tenant.id, approval_id=approval.id, approve=True,
                     decided_by="Paul", channel="web")
        assert db.query(ReviewRequest).filter_by(status="envoye").count() == 1
    raw = base64.urlsafe_b64decode(json.loads(send.calls[0].request.content)["raw"])
    mail = message_from_bytes(raw, policy=default)
    assert mail["To"].addresses[0].addr_spec == "lea@ex.fr"
    assert LINK in mail.get_body().get_content()


async def test_review_refused_and_automatic_mode(ex, tenant, respx_mock):
    send = respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "m"})
    respx_mock.post(WA).respond(200, json={"messages": [{"id": "w"}]})
    now = datetime.now(UTC)
    with session_scope(ex.database_url) as db:
        a = Contact(tenant_id=tenant.id, first_name="Ana", email="ana@ex.fr")
        b = Contact(tenant_id=tenant.id, first_name="Bob", email="bob@ex.fr", tags=["pas_d_avis"])
        db.add_all([a, b])
        _order(db, tenant, a, at=now - timedelta(days=2), handled_at=now - timedelta(hours=30))
        _order(db, tenant, b, at=now - timedelta(days=2), handled_at=now - timedelta(hours=30))
    with session_scope(ex.database_url) as db:
        await schedule_review_requests(db, ex, tenant, now)
        approval = db.query(Approval).filter_by(kind="avis_demande").one()
        await decide(db, ex, tenant_id=tenant.id, approval_id=approval.id, approve=False,
                     decided_by="Paul", channel="web")
        assert db.query(ReviewRequest).filter_by(status="refuse").count() == 1
    with session_scope(ex.database_url) as db:
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.ORDERS, ModuleKey.REVIEWS},
                    {ModuleKey.REVIEWS: Autonomy.AUTOMATIC})
        c = Contact(tenant_id=tenant.id, first_name="Cléo", email="cleo@ex.fr")
        db.add(c)
        _order(db, tenant, c, at=now - timedelta(days=2), handled_at=now - timedelta(hours=26))
    with session_scope(ex.database_url) as db:
        assert await schedule_review_requests(db, ex, tenant, now) == 1
    assert send.call_count == 1  # Cléo seulement : Bob a refusé les sollicitations


def test_extras_api(ex):
    client = TestClient(app)
    tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                               "password": "motdepasse-solide"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.patch("/api/extras/settings", headers=h,
                        json={"review_link": "http://exemple.fr"}).status_code == 422
    assert client.patch("/api/extras/settings", headers=h,
                        json={"review_message": "Merci !"}).status_code == 422
    assert client.patch("/api/extras/settings", headers=h,
                        json={"summary_time": "25:00"}).status_code == 422
    ok = client.patch("/api/extras/settings", headers=h,
                      json={"summary_time": "20:30", "summary_days": [5, 0, 0]}).json()
    assert ok["summary_time"] == "20:30" and ok["summary_days"] == [0, 5]
    assert "Résumé du" in client.get("/api/extras/summary/preview", headers=h).json()["text"]
    poster = client.get("/api/extras/reviews/poster.pdf", headers=h)
    assert poster.status_code == 200 and poster.content.startswith(b"%PDF")
