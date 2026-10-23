import base64
import json
from datetime import UTC, datetime
from email import message_from_bytes
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import Approval, Interaction, MailAccount, MailMessage, User, session_scope
from zunqoo_voice.crm.modules import Autonomy, ModuleKey
from zunqoo_voice.crm.services import set_modules
from zunqoo_voice.mail.account import _ACCESS
from zunqoo_voice.mail.crypto import decrypt, encrypt, generate_key
from zunqoo_voice.mail.gmail import build_reply, parse_message
from zunqoo_voice.mail.processor import sync_tenant
from zunqoo_voice.mail.triage import MailDraft, MailTriage, decide_action

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
TOKEN = "https://oauth2.googleapis.com/token"


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def gmail_msg(mid, *, sender, subject, text, html=None, extra_headers=()):
    headers = [{"name": "From", "value": sender}, {"name": "To", "value": "boutique@gmail.com"},
               {"name": "Subject", "value": subject},
               {"name": "Message-ID", "value": f"<{mid}@mail.example>"}, *extra_headers]
    parts = [{"mimeType": "text/plain", "body": {"data": b64(text)}}]
    if html:
        parts.append({"mimeType": "text/html", "body": {"data": b64(html)}})
    return {"id": mid, "threadId": f"t-{mid}", "internalDate": "1792000000000", "labelIds": ["INBOX"],
            "payload": {"mimeType": "multipart/alternative", "headers": headers, "parts": parts}}


# --- lecture / écriture MIME -----------------------------------------------------


def test_parse_message_prefers_plain_and_strips_quotes():
    msg = gmail_msg("m1", sender="Jean Dupont <Jean@Exemple.fr>", subject="Question",
                    text="Bonjour, ouvert dimanche ?\n\nLe lun. 20 oct. 2026, Boutique a écrit :\n> ancien",
                    html="<p>ignored</p>")
    mail = parse_message(msg)
    assert (mail.from_email, mail.from_name) == ("jean@exemple.fr", "Jean Dupont")
    assert mail.text == "Bonjour, ouvert dimanche ?"
    assert not mail.is_bulk and not mail.is_no_reply


def test_parse_html_only_and_bulk_detection():
    msg = gmail_msg("m2", sender="news@shop.fr", subject="Promo", text="",
                    extra_headers=[{"name": "List-Unsubscribe", "value": "<mailto:x@y>"}])
    msg["payload"]["parts"] = [{"mimeType": "text/html",
                                "body": {"data": b64("<p>Bonjour&nbsp;!<br>Offre</p><style>x</style>")}}]
    mail = parse_message(msg)
    assert mail.is_bulk and mail.text == "Bonjour !\nOffre"


def test_build_reply_threads_correctly():
    original = parse_message(gmail_msg("m3", sender="Ana <ana@ex.fr>", subject="Devis mariage",
                                       text="Bonjour"))
    out = build_reply(original, from_email="boutique@gmail.com", from_name="La Rôtisserie",
                      body="Bonjour Ana,\nMerci !")
    assert out["threadId"] == "t-m3"
    m = message_from_bytes(base64.urlsafe_b64decode(out["raw"]))
    assert m["Subject"] == "Re: Devis mariage"
    assert m["In-Reply-To"] == "<m3@mail.example>" and "ana@ex.fr" in m["To"]
    assert "Merci" in m.get_payload(decode=True).decode()


# --- règle d'envoi ---------------------------------------------------------------


def triage(**kw):
    base = {"category": "renseignement", "importance": "normale", "needs_reply": True,
                "summary": "s", "must_escalate": False, "suspicious": False}
    return MailTriage(**{**base, **kw})


def draft(**kw):
    return MailDraft(**{"body": "Bonjour", "commits": False, "confidence": "haute", **kw})


@pytest.mark.parametrize("autonomy,t,d,expected", [
    (Autonomy.VALIDATE_IMPORTANT, triage(), draft(), "envoi_auto"),
    (Autonomy.VALIDATE_IMPORTANT, triage(), draft(commits=True), "validation"),
    (Autonomy.VALIDATE_IMPORTANT, triage(category="devis"), draft(), "validation"),
    (Autonomy.VALIDATE_ALL, triage(), draft(), "validation"),
    (Autonomy.AUTOMATIC, triage(category="devis"), draft(commits=True), "envoi_auto"),
    (Autonomy.AUTOMATIC, triage(category="devis"), draft(commits=True, confidence="moyenne"),
     "validation"),
    (Autonomy.AUTOMATIC, triage(category="reclamation"), draft(), "validation"),
    (Autonomy.AUTOMATIC, triage(suspicious=True), draft(), "validation"),
    (Autonomy.AUTOMATIC, triage(must_escalate=True), draft(), "validation"),
    (Autonomy.AUTOMATIC, triage(importance="haute"), draft(), "validation"),
    (Autonomy.AUTOMATIC, triage(), draft(confidence="faible"), "validation"),
    (Autonomy.AUTOMATIC, triage(category="publicite"), draft(), "aucune"),
    (Autonomy.AUTOMATIC, triage(needs_reply=False), None, "aucune"),
])
def test_decide_action(autonomy, t, d, expected):
    assert decide_action(autonomy, t, d) == expected


def test_token_encryption_roundtrip():
    s = Settings(mail_token_key=generate_key())
    token = encrypt(s, "1//refresh")
    assert token != "1//refresh" and decrypt(s, token) == "1//refresh"


# --- scénario complet ------------------------------------------------------------


class FakeLLM:
    """Simule le tri et la rédaction selon le contenu de l'e-mail."""

    def __init__(self):
        self.calls = []

    async def extract(self, schema, *, system, user, effort, purpose):
        self.calls.append((schema.__name__, purpose))
        if schema is MailTriage:
            if "rembours" in user:
                return triage(category="reclamation", importance="haute", must_escalate=True,
                              escalate_reason="Demande de remboursement",
                              summary="Client mécontent, demande un remboursement.",
                              customer_first_name="Paul")
            return triage(summary="Demande si ouvert dimanche.", customer_first_name="Jean")
        return draft(body="Bonjour,\nNous sommes au marché de Nogent le dimanche.\nLa Rôtisserie")


@pytest.fixture
def mail_settings(tmp_path, tenant):
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="s" * 40, mail_token_key=generate_key(),
                 google_client_id="cid", google_client_secret="csecret",
                 api_public_url="https://api.zunqoo.test", crm_public_url="https://crm.zunqoo.test",
                 whatsapp_access_token="WA", whatsapp_phone_number_id="PNID")
    FileTenantStore(s.tenants_dir).save(tenant)
    with session_scope(s.database_url) as db:
        set_modules(db, tenant.id, {ModuleKey.PHONE, ModuleKey.EMAIL},
                    {ModuleKey.EMAIL: Autonomy.VALIDATE_IMPORTANT})
        db.add(MailAccount(tenant_id=tenant.id, email="boutique@gmail.com",
                           refresh_token_enc=encrypt(s, "1//refresh"),
                           connected_at=datetime(2026, 1, 1, tzinfo=UTC)))
        db.add(User(tenant_id=tenant.id, email="gerant@roti.fr", name="Paul",
                    password_hash=hash_password("motdepasse-solide")))
    _ACCESS.clear()
    return s


def mock_google(respx_mock):
    respx_mock.post(TOKEN).respond(200, json={"access_token": "ya29", "expires_in": 3600})
    respx_mock.get(f"{GMAIL}/labels").respond(200, json={"labels": []})
    respx_mock.post(f"{GMAIL}/labels").respond(200, json={"id": "Label_1", "name": "Zunqoo"})
    respx_mock.get(f"{GMAIL}/messages").respond(200, json={"messages": [
        {"id": "news"}, {"id": "q1"}, {"id": "angry"}, {"id": "self"}]})
    msgs = {
        "news": gmail_msg("news", sender="promo@grossiste.fr", subject="-50 %", text="Offre",
                          extra_headers=[{"name": "List-Unsubscribe", "value": "<x>"}]),
        "q1": gmail_msg("q1", sender="Jean Dupont <jean@exemple.fr>", subject="Dimanche ?",
                        text="Bonjour, êtes-vous là dimanche ?"),
        "angry": gmail_msg("angry", sender="paul@exemple.fr", subject="Commande ratée",
                           text="Poulet froid, je veux être remboursé."),
        "self": gmail_msg("self", sender="boutique@gmail.com", subject="note", text="x"),
    }
    for mid, body in msgs.items():
        respx_mock.get(f"{GMAIL}/messages/{mid}").respond(200, json=body)
    modify = respx_mock.post(url__regex=rf"{GMAIL}/messages/\w+/modify").respond(200, json={})
    send = respx_mock.post(f"{GMAIL}/messages/send").respond(200, json={"id": "sent-1"})
    wa = respx_mock.post("https://graph.facebook.com/v21.0/PNID/messages").respond(
        200, json={"messages": [{"id": "wamid"}]})
    return send, modify, wa


async def test_sync_tenant_full_flow(mail_settings, tenant, respx_mock):
    send, modify, wa = mock_google(respx_mock)
    llm = FakeLLM()
    r = await sync_tenant(mail_settings, tenant, llm=llm)
    assert (r.seen, r.ignored, r.filed, r.auto_sent, r.to_validate, r.errors) == (4, 1, 2, 1, 1, [])
    # La newsletter et le propre e-mail de la boutique n'ont coûté aucun appel LLM.
    assert [c[0] for c in llm.calls].count("MailTriage") == 2
    assert send.call_count == 1  # seule la question simple part toute seule
    sent = json.loads(send.calls[0].request.content)
    assert sent["threadId"] == "t-q1"
    assert modify.call_count == 3  # libellé Zunqoo sur tout ce qui a été traité
    assert wa.called  # alerte WhatsApp pour la réclamation

    with session_scope(mail_settings.database_url) as db:
        approval = db.query(Approval).one()
        assert approval.kind == "email_reponse" and "remboursement" in approval.summary
        statuses = {m.provider_id: m.status for m in db.query(MailMessage)}
        assert statuses == {"news": "ignore", "q1": "envoye_auto", "angry": "a_valider",
                            "self": "ignore"}
        assert db.query(Interaction).filter_by(channel="email").count() == 3

    # Relancer la relève ne retraite rien.
    r2 = await sync_tenant(mail_settings, tenant, llm=llm)
    assert r2.seen == 0 and send.call_count == 1

    # Le gérant corrige la réponse puis valide depuis le CRM : l'e-mail part.
    app.dependency_overrides[get_settings] = lambda: mail_settings
    try:
        client = TestClient(app)
        tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                                   "password": "motdepasse-solide"}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        res = client.post(f"/api/approvals/{approval.id}/decision", headers=h,
                          json={"approve": True, "edits": {"body": "Bonjour Paul, toutes nos excuses."}})
        assert res.json()["status"] == "execute", res.json()
        assert send.call_count == 2
        raw = json.loads(send.calls[1].request.content)["raw"]
        assert "toutes nos excuses" in message_from_bytes(base64.urlsafe_b64decode(raw)) \
            .get_payload(decode=True).decode()
        status = client.get("/api/email/status", headers=h).json()
        assert status["connected"] and status["email"] == "boutique@gmail.com"
    finally:
        app.dependency_overrides.clear()


async def test_sync_skipped_when_module_off(mail_settings, tenant, respx_mock):
    with session_scope(mail_settings.database_url) as db:
        set_modules(db, tenant.id, {ModuleKey.PHONE})
    r = await sync_tenant(mail_settings, tenant, llm=FakeLLM())
    assert r.seen == 0 and not respx_mock.calls


def _fake_id_token(email: str) -> str:
    seg = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{seg({'alg': 'none'})}.{seg({'email': email})}.sig"


def test_oauth_connect_and_callback(mail_settings, respx_mock):
    app.dependency_overrides[get_settings] = lambda: mail_settings
    try:
        client = TestClient(app)
        tok = client.post("/api/auth/login", json={"email": "gerant@roti.fr",
                                                   "password": "motdepasse-solide"}).json()["token"]
        url = client.post("/api/email/connect", headers={"Authorization": f"Bearer {tok}"}).json()["url"]
        q = parse_qs(urlparse(url).query)
        assert q["redirect_uri"] == ["https://api.zunqoo.test/oauth/google/callback"]
        assert "https://www.googleapis.com/auth/gmail.modify" in q["scope"][0]

        respx_mock.post(TOKEN).respond(200, json={
            "access_token": "ya29", "refresh_token": "1//new", "expires_in": 3600,
            "scope": "openid email https://www.googleapis.com/auth/gmail.modify",
            "id_token": _fake_id_token("Nouvelle@Gmail.com")})
        res = client.get(f"/oauth/google/callback?code=abc&state={q['state'][0]}",
                         follow_redirects=False)
        assert res.status_code == 303 and res.headers["location"].endswith("/reglages?gmail=ok")
        with session_scope(mail_settings.database_url) as db:
            acc = db.query(MailAccount).one()
            assert acc.email == "nouvelle@gmail.com"
            assert decrypt(mail_settings, acc.refresh_token_enc) == "1//new"
            assert "1//new" not in acc.refresh_token_enc

        bad = client.get("/oauth/google/callback?code=abc&state=forged", follow_redirects=False)
        assert "gmail=erreur" in bad.headers["location"]
    finally:
        app.dependency_overrides.clear()


def test_httpx_available():
    assert httpx.__version__


async def test_mail_received_before_connection_is_left_alone(mail_settings, tenant, respx_mock):
    send, modify, _ = mock_google(respx_mock)
    with session_scope(mail_settings.database_url) as db:
        db.query(MailAccount).one().connected_at = datetime(2027, 1, 1, tzinfo=UTC)
    llm = FakeLLM()
    r = await sync_tenant(mail_settings, tenant, llm=llm)
    assert (r.seen, r.ignored, r.filed) == (4, 4, 0)
    assert llm.calls == [] and not send.called and not modify.called  # aucune trace dans Gmail
    query = next(c.request.url.params["q"] for c in respx_mock.calls
                 if c.request.url.path.endswith("/messages"))
    assert f"after:{int(datetime(2027, 1, 1, tzinfo=UTC).timestamp())}" in query


def test_email_module_starts_in_validate_all(mail_settings, tenant):
    from zunqoo_voice.crm.services import get_modules
    with session_scope(mail_settings.database_url) as db:
        set_modules(db, "nouveau", {ModuleKey.EMAIL})
        assert get_modules(db, "nouveau")[ModuleKey.EMAIL].autonomy == Autonomy.VALIDATE_ALL
