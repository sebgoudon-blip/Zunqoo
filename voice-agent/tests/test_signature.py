import base64
import hashlib
import io
import json
import re
from datetime import UTC, datetime, timedelta
from email import message_from_bytes, policy

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from pypdf import PdfReader

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import (
    Approval,
    Interaction,
    MailAccount,
    Quote,
    QuoteSignature,
    User,
    session_scope,
)
from zunqoo_voice.crm.modules import ModuleKey
from zunqoo_voice.crm.services import seed_catalog_from_profile, set_modules
from zunqoo_voice.mail.account import _ACCESS
from zunqoo_voice.mail.crypto import encrypt, generate_key

GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
WA = "https://graph.facebook.com/v21.0/PNID/messages"
LEGAL = {"legal_name": "SARL Rôtisserie du Marché", "address": "1 place du Marché",
         "postal_code": "26200", "city": "Montélimar", "siret": "12345678900012",
         "vat_number": "FR12123456789", "phone": "01 87 00 00 00"}


@pytest.fixture
def sg(tmp_path, tenant, respx_mock):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, mail_token_key=generate_key(),
                 google_client_id="cid", google_client_secret="cs",
                 crm_public_url="https://crm.test",
                 whatsapp_access_token="WA", whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    with session_scope(s.database_url) as db:
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
        db.add(MailAccount(tenant_id=tenant.id, email="boutique@gmail.com",
                           scopes="openid email https://www.googleapis.com/auth/gmail.modify",
                           refresh_token_enc=encrypt(s, "r"),
                           connected_at=datetime(2026, 1, 1, tzinfo=UTC)))
        seed_catalog_from_profile(db, tenant.id, tenant.profile, vat_rate=5.5)
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.EMAIL, ModuleKey.QUOTES,
                                    ModuleKey.INVOICES})
    respx_mock.post("https://oauth2.googleapis.com/token").respond(200, json={"access_token": "a"})
    respx_mock.post(WA).respond(200, json={"messages": [{"id": "w"}]})
    _ACCESS.clear()
    app.dependency_overrides[get_settings] = lambda: s
    yield s
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    c = TestClient(app)
    tok = c.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                          "password": "motdepasse-solide"}).json()["token"]
    c.headers["Authorization"] = f"Bearer {tok}"
    return c


def _quote(client, *, email: str | None = "ana@ex.fr") -> dict:
    client.patch("/api/business", json=LEGAL)
    contact = client.post("/api/contacts", json={"first_name": "Ana", "last_name": "Leroy",
                                                 "email": email}).json()
    return client.post("/api/quotes", json={
        "contact_id": contact["id"], "title": "Mariage 40 personnes",
        "lines": [{"description": "Poulet rôti", "quantity": 10, "unit_price": 16.5,
                   "vat_rate": 5.5}]}).json()


def _mail(call) -> object:
    raw = base64.urlsafe_b64decode(json.loads(call.request.content)["raw"])
    return message_from_bytes(raw, policy=policy.default)


def _signature_png() -> str:
    img = Image.new("RGBA", (600, 200), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    for i in range(0, 560, 7):
        d.line([(20 + i, 100 + (i % 50) - 25), (27 + i, 100 - (i % 40) + 20)], fill="black",
               width=4)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_full_online_signature(sg, client, respx_mock):
    send = respx_mock.post(GMAIL_SEND).respond(200, json={"id": "m"})
    public = TestClient(app)  # le client n'a pas de compte
    q = _quote(client)
    assert client.post(f"/api/quotes/{q['id']}/send", json={}).status_code == 200

    sent = _mail(send.calls[0])
    body = sent.get_body(("plain",)).get_content()
    token = re.search(r"https://crm\.test/signer/([\w-]+)", body).group(1)
    assert "[lien de signature]" not in body
    attached = next(sent.iter_attachments()).get_content()
    with session_scope(sg.database_url) as db:
        sig = db.query(QuoteSignature).one()
        assert attached == sig.document_pdf  # pièce jointe = document signé
        assert sig.document_sha256 == hashlib.sha256(attached).hexdigest()

    view = public.get(f"/api/public/signature/{token}").json()
    assert view["quote"]["number"].startswith("DEV-") and view["quote"]["total_ttc"] == 165.0
    assert view["signature"]["otp_required"] and view["signature"]["email"].startswith("a")
    assert "165,00\u00a0€ TTC" in view["signature"]["mention"]
    assert public.get(f"/api/public/signature/{token[:-1]}x").status_code == 404

    png = _signature_png()
    sign = {"name": "Ana Leroy", "signature": png, "accept": True}
    r = public.post(f"/api/public/signature/{token}/sign", json=sign)
    assert r.status_code == 400 and "code" in r.json()["detail"]

    assert public.post(f"/api/public/signature/{token}/code").status_code == 200
    code = re.search(r"\b(\d{6})\b", _mail(send.calls[1])["Subject"]).group(1)
    wrong = "000000" if code != "000000" else "111111"
    assert public.post(f"/api/public/signature/{token}/code/verify",
                       json={"code": wrong}).status_code == 400
    with session_scope(sg.database_url) as db:
        assert db.query(QuoteSignature).one().otp_attempts == 1  # l'essai est gardé
    assert public.post(f"/api/public/signature/{token}/code/verify",
                       json={"code": code}).json() == {"verified": True}

    bad = public.post(f"/api/public/signature/{token}/sign",
                      json={**sign, "signature": "data:image/png;base64,AAAA"})
    assert bad.status_code == 400
    r = public.post(f"/api/public/signature/{token}/sign", json=sign,
                    headers={"User-Agent": "Mozilla/5.0 Test", "X-Forwarded-For": "203.0.113.7"})
    assert r.status_code == 200, r.text
    assert public.post(f"/api/public/signature/{token}/sign", json=sign).status_code == 409

    with session_scope(sg.database_url) as db:
        quote = db.get(Quote, q["id"])
        assert quote.status == "accepte"
        assert db.query(Approval).filter_by(kind="facture_emission").count() == 1
        sig = db.query(QuoteSignature).one()
        assert (sig.signer_ip, sig.signer_user_agent) == ("203.0.113.7", "Mozilla/5.0 Test")
        assert [e["event"] for e in sig.events][-2:] == ["signe", "copie_envoyee"]
        assert db.query(Interaction).filter(Interaction.title.like("%signé en ligne%")).count() == 1

    signed = client.get(f"/api/quotes/{q['id']}/signed.pdf")
    reader = PdfReader(io.BytesIO(signed.content))
    original_pages = len(PdfReader(io.BytesIO(attached)).pages)
    assert len(reader.pages) == original_pages + 1
    cert = reader.pages[-1].extract_text()
    assert "Certificat de signature" in cert and "Ana Leroy" in cert
    assert "203.0.113.7" in cert and "vérifié par code" in cert
    assert sig.document_sha256[:20] in cert.replace("\n", "")

    copy = _mail(send.calls[-1])  # exemplaire signé envoyé au client
    assert copy["To"].addresses[0].addr_spec == "ana@ex.fr"
    assert next(copy.iter_attachments()).get_content() == signed.content
    info = client.get(f"/api/quotes/{q['id']}/signature").json()["signature"]
    assert info["status"] == "signe" and info["url"] is None and info["signer_name"] == "Ana Leroy"
    listed = client.get("/api/quotes").json()
    assert listed[0]["signed_online"] is True


def test_manual_link_refusal_and_expiry(sg, client, respx_mock):
    respx_mock.post(GMAIL_SEND).respond(200, json={"id": "m"})
    public = TestClient(app)
    q = _quote(client, email=None)  # remis en main : pas d'e-mail, pas de code
    assert client.post(f"/api/quotes/{q['id']}/signature").status_code == 409  # pas encore émis
    client.post(f"/api/quotes/{q['id']}/send", json={"by_email": False})
    link = client.post(f"/api/quotes/{q['id']}/signature").json()["signature"]["url"]
    token = link.rsplit("/", 1)[1]
    assert public.get(f"/api/public/signature/{token}").json()["signature"]["otp_required"] is False

    r = public.post(f"/api/public/signature/{token}/refuse", json={"reason": "Trop cher"})
    assert r.json() == {"status": "refuse"}
    with session_scope(sg.database_url) as db:
        assert db.get(Quote, q["id"]).status == "refuse"
        assert db.query(Interaction).filter(Interaction.title.like("%Trop cher%")).count() == 1
    assert public.post(f"/api/public/signature/{token}/sign", json={
        "name": "Ana Leroy", "signature": _signature_png(), "accept": True}).status_code == 409

    q2 = _quote(client, email=None)
    client.post(f"/api/quotes/{q2['id']}/send", json={"by_email": False})
    token2 = client.post(f"/api/quotes/{q2['id']}/signature").json()["signature"]["url"].rsplit("/", 1)[1]
    with session_scope(sg.database_url) as db:
        db.query(QuoteSignature).filter_by(quote_id=q2["id"]).one().expires_at = (
            datetime.now(UTC) - timedelta(minutes=1))
    assert "expiré" in public.get(f"/api/public/signature/{token2}").json()["signature"]["closed"]
    assert public.post(f"/api/public/signature/{token2}/sign", json={
        "name": "Ana Leroy", "signature": _signature_png(), "accept": True}).status_code == 410


def test_code_attempts_are_limited(sg, client, respx_mock):
    respx_mock.post(GMAIL_SEND).respond(200, json={"id": "m"})
    public = TestClient(app)
    q = _quote(client)
    client.post(f"/api/quotes/{q['id']}/send", json={})
    with session_scope(sg.database_url) as db:
        from zunqoo_voice.documents.signature import sign_token

        token = sign_token(sg, db.query(QuoteSignature).one())
    public.post(f"/api/public/signature/{token}/code")
    codes = [public.post(f"/api/public/signature/{token}/code/verify", json={"code": "999999"})
             for _ in range(6)]
    assert codes[-1].status_code == 429
