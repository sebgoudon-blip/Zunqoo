import base64
import io
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from email import message_from_bytes, policy

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import (
    Approval,
    BusinessSettings,
    Contact,
    MailAccount,
    MailMessage,
    Quote,
    User,
    session_scope,
)
from zunqoo_voice.crm.modules import ModuleKey
from zunqoo_voice.crm.services import seed_catalog_from_profile, set_modules
from zunqoo_voice.documents.numbering import next_number
from zunqoo_voice.documents.quotes import (
    DraftLine,
    QuoteDraft,
    QuoteError,
    clean_lines,
    due_reminders,
    schedule_reminders,
)
from zunqoo_voice.documents.totals import compute_totals
from zunqoo_voice.mail.account import _ACCESS
from zunqoo_voice.mail.crypto import encrypt, generate_key
from zunqoo_voice.mail.processor import sync_tenant
from zunqoo_voice.mail.triage import MailDraft, MailTriage

D = Decimal


# --- calculs -------------------------------------------------------------------


def test_totals_ttc_mode_keeps_public_prices_exact():
    lines = [{"quantity": "3", "unit_price": "16.50", "vat_rate": "5.5"},
             {"quantity": "2", "unit_price": "5.00", "vat_rate": "5.5"},
             {"quantity": "1", "unit_price": "4.00", "vat_rate": "20"}]
    t = compute_totals(lines, prices_include_vat=True)
    assert t.total_ttc == D("63.50")            # 49,50 + 10 + 4 : ce que paie le client
    g55, g20 = t.vat_groups
    assert (g55.base_ht, g55.vat) == (D("56.40"), D("3.10"))
    assert (g20.base_ht, g20.vat) == (D("3.33"), D("0.67"))
    assert t.total_ht + t.total_vat == t.total_ttc and t.complete


def test_totals_ht_mode_and_franchise():
    lines = [{"quantity": "10", "unit_price": "12.345", "vat_rate": "10"}]
    t = compute_totals(lines, prices_include_vat=False)
    assert (t.total_ht, t.total_vat, t.total_ttc) == (D("123.45"), D("12.35"), D("135.80"))
    f = compute_totals(lines, prices_include_vat=False, vat_franchise=True)
    assert (f.total_vat, f.total_ttc) == (D("0.00"), D("123.45"))
    assert not compute_totals([{"quantity": 1, "unit_price": None}],
                              prices_include_vat=True).complete


def test_clean_lines_validation():
    with pytest.raises(QuoteError):
        clean_lines([{"description": "x", "quantity": 0, "unit_price": 1}])
    with pytest.raises(QuoteError):
        clean_lines([{"description": "x", "quantity": 1, "unit_price": 1, "vat_rate": 7}])
    out = clean_lines([{"description": " Poulet ", "quantity": "2.0", "unit_price": "16.5",
                        "vat_rate": "5.50"}])
    assert out[0] == {"description": "Poulet", "detail": None, "catalog_item_id": None,
                      "quantity": "2", "unit": None, "unit_price": "16.50", "vat_rate": "5.5"}


def test_numbering_is_continuous_per_year(tmp_path):
    url = f"sqlite:///{tmp_path}/n.sqlite3"
    with session_scope(url) as db:
        d = datetime(2026, 5, 1)
        assert [next_number(db, "t", "DEV", d) for _ in range(3)] == [
            "DEV-2026-0001", "DEV-2026-0002", "DEV-2026-0003"]
        assert next_number(db, "t", "FAC", d) == "FAC-2026-0001"
        assert next_number(db, "t", "DEV", datetime(2027, 1, 2)) == "DEV-2027-0001"
        assert next_number(db, "autre", "DEV", d) == "DEV-2026-0001"


# --- API -------------------------------------------------------------------------


@pytest.fixture
def qs(tmp_path, tenant):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, mail_token_key=generate_key(),
                 google_client_id="cid", google_client_secret="cs",
                 whatsapp_access_token="WA", whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    with session_scope(s.database_url) as db:
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
        seed_catalog_from_profile(db, tenant.id, tenant.profile, vat_rate=5.5)
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.EMAIL, ModuleKey.QUOTES})
    _ACCESS.clear()
    app.dependency_overrides[get_settings] = lambda: s
    yield s
    app.dependency_overrides.clear()


def auth(client):
    tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                               "password": "motdepasse-solide"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


LEGAL = {"legal_name": "SARL Rôtisserie du Marché", "address": "1 place du Marché",
         "postal_code": "26200", "city": "Montélimar", "siret": "12345678900012",
         "vat_number": "FR12123456789", "phone": "01 87 00 00 00"}


def test_quote_api_flow(qs):
    client = TestClient(app)
    h = auth(client)
    catalog = client.get("/api/catalog", headers=h).json()
    poulet = next(i for i in catalog if i["name"].startswith("Poulet"))
    contact = client.post("/api/contacts", json={"first_name": "Ana", "last_name": "Leroy",
                                                 "email": "ana@ex.fr"}, headers=h).json()

    q = client.post("/api/quotes", headers=h, json={
        "contact_id": contact["id"], "title": "Mariage 40 personnes",
        "lines": [{"catalog_item_id": poulet["id"], "quantity": 10},
                  {"description": "Location de la rôtissoire", "quantity": 1,
                   "unit_price": 80, "vat_rate": 20}]}).json()
    assert q["lines"][0]["unit_price"] == "16.50"   # prix du catalogue, pas saisi
    assert q["total_ttc"] == 245.0 and q["number"] is None

    # Envoi impossible tant que les mentions légales manquent.
    r = client.post(f"/api/quotes/{q['id']}/send", json={"by_email": False}, headers=h)
    assert r.status_code == 400 and "SIRET" in r.json()["detail"]
    assert client.patch("/api/business", json={"siret": "123"}, headers=h).status_code == 422
    assert client.patch("/api/business", json=LEGAL, headers=h).json()["missing"] == []

    pdf = client.get(f"/api/quotes/{q['id']}/pdf", headers=h)
    assert pdf.headers["content-type"] == "application/pdf"
    text = PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    assert "Devis n° PROJET" in text and "245,00" in text and "Bon pour accord" in text

    sent = client.post(f"/api/quotes/{q['id']}/send", json={"by_email": False}, headers=h).json()
    assert (sent["status"], sent["number"]) == ("envoye", f"DEV-{datetime.now(UTC).year}-0001")
    assert client.patch(f"/api/quotes/{q['id']}", json={"title": "x"}, headers=h).status_code == 409
    assert client.delete(f"/api/quotes/{q['id']}", headers=h).status_code == 409
    done = client.post(f"/api/quotes/{q['id']}/status", json={"status": "accepte"}, headers=h).json()
    assert done["status"] == "accepte"

    copy = client.post(f"/api/quotes/{q['id']}/duplicate", headers=h).json()
    assert copy["status"] == "brouillon" and copy["number"] is None and copy["total_ttc"] == 245.0
    assert client.delete(f"/api/quotes/{copy['id']}", headers=h).status_code == 204


# --- e-mail -> devis -> envoi --------------------------------------------------


class QuoteLLM:
    async def extract(self, schema, *, system, user, effort, purpose):
        if schema is MailTriage:
            return MailTriage(category="devis", importance="normale", needs_reply=True,
                              summary="Devis pour 40 personnes le 15/11.", must_escalate=False,
                              suspicious=False, customer_first_name="Ana",
                              request_details="40 personnes, poulets et pommes de terre")
        if schema is MailDraft:
            return MailDraft(body="Bonjour Ana,\nVoici notre devis.\nLa Rôtisserie",
                             commits=False, confidence="haute")
        assert schema is QuoteDraft and "CATALOGUE" in user
        return QuoteDraft(title="Repas 40 personnes", lines=[
            DraftLine(catalog_index=2, description="Poulet fermier Label Rouge", quantity=10),
            DraftLine(catalog_index=0, description="Pommes de terre au jus", quantity=8),
            DraftLine(catalog_index=None, description="Sauce maison", quantity=2),
        ], questions=["Livraison ou retrait ?"])


def gmail_msg(mid, sender, subject, text):
    data = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
    return {"id": mid, "threadId": f"t-{mid}", "internalDate": "1792000000000",
            "payload": {"mimeType": "text/plain", "body": {"data": data}, "headers": [
                {"name": "From", "value": sender}, {"name": "Subject", "value": subject},
                {"name": "Message-ID", "value": f"<{mid}@x>"}]}}


async def test_quote_request_email_becomes_priced_quote(qs, tenant, respx_mock):
    G = "https://gmail.googleapis.com/gmail/v1/users/me"
    with session_scope(qs.database_url) as db:
        db.add(MailAccount(tenant_id=tenant.id, email="boutique@gmail.com",
                           refresh_token_enc=encrypt(qs, "r"), connected_at=datetime(2026, 1, 1, tzinfo=UTC)))
        db.merge(BusinessSettings(tenant_id=tenant.id, **LEGAL))
    respx_mock.post("https://oauth2.googleapis.com/token").respond(200, json={"access_token": "a"})
    respx_mock.get(f"{G}/labels").respond(200, json={"labels": [{"id": "L", "name": "Zunqoo"}]})
    respx_mock.get(f"{G}/messages").respond(200, json={"messages": [{"id": "dv"}]})
    respx_mock.get(f"{G}/messages/dv").respond(200, json=gmail_msg(
        "dv", "Ana Leroy <ana@ex.fr>", "Devis mariage", "Bonjour, un devis pour 40 personnes ?"))
    respx_mock.post(url__regex=rf"{G}/messages/\w+/modify").respond(200, json={})
    send = respx_mock.post(f"{G}/messages/send").respond(200, json={"id": "s1"})
    respx_mock.post("https://graph.facebook.com/v21.0/PNID/messages").respond(
        200, json={"messages": [{"id": "w"}]})

    r = await sync_tenant(qs, tenant, llm=QuoteLLM())
    assert (r.to_validate, r.auto_sent) == (1, 0) and not send.called
    with session_scope(qs.database_url) as db:
        quote = db.query(Quote).one()
        names = [ln["description"] for ln in quote.lines]
        prices = [ln["unit_price"] for ln in quote.lines]
        assert names[0].startswith("Poulet") and prices[0] == "16.50"  # prix du catalogue
        assert prices[2] is None                                        # hors catalogue
        assert quote.status == "a_valider" and "Livraison ou retrait" in quote.internal_notes
        approval = db.query(Approval).one()
        assert approval.kind == "devis_envoi" and "prix à compléter" in approval.summary
        quote_id, approval_id = quote.id, approval.id

    client = TestClient(app)
    h = auth(client)
    # Validation refusée tant qu'une ligne n'a pas de prix…
    res = client.post(f"/api/approvals/{approval_id}/decision", json={"approve": True}, headers=h)
    assert res.status_code == 409 and "prix" in res.json()["detail"]
    assert [a["id"] for a in client.get("/api/approvals", headers=h).json()] == [approval_id]
    # … le gérant chiffre la sauce et envoie depuis l'éditeur.
    q = client.get(f"/api/quotes/{quote_id}", headers=h).json()
    lines = q["lines"]
    lines[2]["unit_price"] = "3.00"
    client.patch(f"/api/quotes/{quote_id}", json={"lines": lines}, headers=h)
    sent = client.post(f"/api/quotes/{quote_id}/send", headers=h,
                       json={"email_body": "Bonjour Ana,\nVoici notre devis."}).json()
    assert sent["status"] == "envoye"
    assert client.get("/api/approvals", headers=h).json() == []  # validation close
    mime = message_from_bytes(base64.urlsafe_b64decode(json.loads(send.calls[0].request.content)["raw"]),
                              policy=policy.default)
    attachments = [p.get_filename() for p in mime.iter_attachments()]
    assert attachments == [f"Devis-{sent['number']}.pdf"]
    assert json.loads(send.calls[0].request.content)["threadId"] == "t-dv"  # même fil

    # Relances : J+3 puis J+7, jamais reproposées si refusées.
    with session_scope(qs.database_url) as db:
        quote = db.get(Quote, quote_id)
        quote.sent_at = datetime.now(UTC) - timedelta(days=4)
    with session_scope(qs.database_url) as db:
        assert await schedule_reminders(db, qs, tenant, datetime.now(UTC)) == 1
        assert await schedule_reminders(db, qs, tenant, datetime.now(UTC)) == 0
        reminder = db.query(Approval).filter_by(kind="devis_relance").one()
        assert "Je me permets de revenir" in reminder.payload["body"]
        assert due_reminders(db, tenant.id, datetime.now(UTC) + timedelta(days=4))


def test_contact_model_import():
    assert Contact and MailMessage
