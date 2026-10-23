import io
import re
from datetime import UTC, datetime, timedelta

import facturx
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import Approval, BusinessSettings, Invoice, User, session_scope
from zunqoo_voice.crm.modules import ModuleKey
from zunqoo_voice.crm.services import seed_catalog_from_profile, set_modules
from zunqoo_voice.documents.invoices import schedule_invoice_reminders

LEGAL = {"legal_name": "SARL Rôtisserie du Marché", "address": "1 place du Marché",
         "postal_code": "26200", "city": "Montélimar", "siret": "12345678900012",
         "vat_number": "FR12123456789", "iban": "FR7630006000011234567890189"}
YEAR = datetime.now(UTC).year


@pytest.fixture
def client(tmp_path, tenant):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, whatsapp_access_token="WA",
                 whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    with session_scope(s.database_url) as db:
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
        seed_catalog_from_profile(db, tenant.id, tenant.profile, vat_rate=5.5)
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.QUOTES, ModuleKey.INVOICES})
        db.add(BusinessSettings(tenant_id=tenant.id, payment_terms_days=30, **LEGAL))
    app.dependency_overrides[get_settings] = lambda: s
    c = TestClient(app)
    tok = c.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                          "password": "motdepasse-solide"}).json()["token"]
    c.headers["Authorization"] = f"Bearer {tok}"
    c.settings = s
    yield c
    app.dependency_overrides.clear()


def make_invoice(client, *, company=None, siren=None, lines=None):
    contact = client.post("/api/contacts", json={
        "first_name": "Jean", "last_name": "Dupont", "email": "jean@ex.fr",
        **({"company": company} if company else {}), **({"siren": siren} if siren else {}),
    }).json()
    return client.post("/api/invoices", json={
        "contact_id": contact["id"], "title": "Commande traiteur",
        "lines": lines or [{"description": "Poulet fermier", "quantity": 4, "unit": "pièce",
                            "unit_price": "16.50", "vat_rate": "5.5"},
                           {"description": "Boisson", "quantity": 2, "unit_price": "3.00",
                            "vat_rate": "20"}],
    }).json()


def test_issue_freezes_invoice_with_factur_x(client):
    inv = make_invoice(client)
    assert inv["status"] == "brouillon" and inv["number"] is None and inv["total_ttc"] == 72.0
    issued = client.post(f"/api/invoices/{inv['id']}/issue").json()
    assert issued["number"] == f"FAC-{YEAR}-0001" and issued["status"] == "emise"
    assert issued["due_date"][:10] == (datetime.now(UTC) + timedelta(days=30)).date().isoformat()

    # Figée : ni modification ni suppression.
    assert client.patch(f"/api/invoices/{inv['id']}", json={"title": "x"}).status_code == 409
    assert client.delete(f"/api/invoices/{inv['id']}").status_code == 409

    pdf = client.get(f"/api/invoices/{inv['id']}/pdf").content
    name, xml = facturx.get_facturx_xml_from_pdf(pdf)
    assert name == "factur-x.xml"
    assert re.search(rb"<ram:GrandTotalAmount>72.00<", xml)
    assert re.search(rb"<ram:ID>FAC-\d{4}-0001</ram:ID>", xml)
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert "Facture n° FAC-" in text and "Net à payer" in text and "IBAN" in text
    assert "40 €" not in text  # client particulier : pas de mentions B2B
    # Le PDF archivé est rendu à l'identique, même si la fiche change ensuite.
    client.patch("/api/business", json={"legal_name": "Autre nom"})
    assert client.get(f"/api/invoices/{inv['id']}/pdf").content == pdf


def test_b2b_mentions_and_continuous_numbering(client):
    a = make_invoice(client, company="Mairie de Donzère", siren="123456789")
    b = make_invoice(client)
    client.post(f"/api/invoices/{b['id']}/issue")
    issued = client.post(f"/api/invoices/{a['id']}/issue").json()
    assert issued["number"] == f"FAC-{YEAR}-0002"  # dans l'ordre d'émission
    text = PdfReader(io.BytesIO(client.get(f"/api/invoices/{a['id']}/pdf").content)).pages[0].extract_text()
    assert "40 €" in text and "SIREN 123456789" in text and "Pas d'escompte" in text


def test_issue_requires_legal_details_and_prices(client):
    with session_scope(client.settings.database_url) as db:
        db.get(BusinessSettings, "rotisserie-demo").siret = None
    inv = make_invoice(client)
    r = client.post(f"/api/invoices/{inv['id']}/issue")
    assert r.status_code == 400 and "SIRET" in r.json()["detail"]
    with session_scope(client.settings.database_url) as db:
        db.get(BusinessSettings, "rotisserie-demo").siret = LEGAL["siret"]
    bad = make_invoice(client, lines=[{"description": "Sur mesure", "quantity": 1}])
    assert "prix" in client.post(f"/api/invoices/{bad['id']}/issue").json()["detail"]
    assert client.delete(f"/api/invoices/{bad['id']}").status_code == 204  # brouillon


def test_payments_and_credit_notes(client):
    inv = make_invoice(client)
    client.post(f"/api/invoices/{inv['id']}/issue")
    assert client.post(f"/api/invoices/{inv['id']}/payments", json={"amount": 100}).status_code == 400
    part = client.post(f"/api/invoices/{inv['id']}/payments",
                       json={"amount": 30, "method": "carte"}).json()
    assert (part["status"], part["remaining"]) == ("partiellement_payee", 42.0)
    paid = client.post(f"/api/invoices/{inv['id']}/payments", json={"amount": 42}).json()
    assert paid["status"] == "payee"

    other = make_invoice(client)
    client.post(f"/api/invoices/{other['id']}/issue")
    too_big = client.post(f"/api/invoices/{other['id']}/credit-note", json={"lines": [
        {"description": "Geste", "quantity": 1, "unit_price": "500", "vat_rate": "5.5"}]})
    assert too_big.status_code == 400
    note = client.post(f"/api/invoices/{other['id']}/credit-note", json={}).json()
    assert note["kind"] == "avoir" and note["total_ttc"] == 72.0
    issued = client.post(f"/api/invoices/{note['id']}/issue").json()
    assert issued["number"] == f"AV-{YEAR}-0001"
    original = client.get(f"/api/invoices/{other['id']}").json()
    assert original["status"] == "annulee" and original["credit_notes"][0]["number"] == issued["number"]
    _, xml = facturx.get_facturx_xml_from_pdf(client.get(f"/api/invoices/{note['id']}/pdf").content)
    assert b"<ram:TypeCode>381</ram:TypeCode>" in xml  # 381 = avoir


def test_accepted_quote_proposes_invoice(client):
    catalog = client.get("/api/catalog").json()
    contact = client.post("/api/contacts", json={"first_name": "Ana", "email": "ana@ex.fr"}).json()
    q = client.post("/api/quotes", json={"contact_id": contact["id"], "title": "Mariage",
                                         "lines": [{"catalog_item_id": catalog[0]["id"],
                                                    "quantity": 3}]}).json()
    client.post(f"/api/quotes/{q['id']}/send", json={"by_email": False})
    client.post(f"/api/quotes/{q['id']}/status", json={"status": "accepte"})
    approvals = client.get("/api/approvals").json()
    assert [a["kind"] for a in approvals] == ["facture_emission"]
    # Pas de Gmail : la validation émet la facture et le signale.
    res = client.post(f"/api/approvals/{approvals[0]['id']}/decision", json={"approve": True}).json()
    assert res["status"] == "execute" and "non envoyée" in res["result"]
    invoices = client.get("/api/invoices").json()
    assert invoices[0]["number"] == f"FAC-{YEAR}-0001" and invoices[0]["quote_id"] == q["id"]
    assert client.get(f"/api/quotes/{q['id']}").json()["status"] == "facture"


async def test_overdue_reminders(client, tenant, respx_mock):
    respx_mock.post("https://graph.facebook.com/v21.0/PNID/messages").respond(
        200, json={"messages": [{"id": "w"}]})
    inv = make_invoice(client)
    client.post(f"/api/invoices/{inv['id']}/issue")
    with session_scope(client.settings.database_url) as db:
        db.get(Invoice, inv["id"]).due_date = datetime.now(UTC) - timedelta(days=4)
    with session_scope(client.settings.database_url) as db:
        assert await schedule_invoice_reminders(db, client.settings, tenant, datetime.now(UTC)) == 1
        assert await schedule_invoice_reminders(db, client.settings, tenant, datetime.now(UTC)) == 0
        a = db.query(Approval).filter_by(kind="facture_relance").one()
        assert "reste à régler" in a.payload["body"]
    view = client.get("/api/today").json()["invoices"]
    assert (view["overdue_count"], view["overdue_total"]) == (1, 72.0)
