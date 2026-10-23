"""Audit de sécurité : on attaque la plateforme comme le ferait un intrus.

Deux commerces (tenant A et tenant B) et trois comptes. Chaque test vérifie
qu'un commerce ne peut jamais voir ni modifier les données d'un autre, qu'un
simple employé ne peut pas agir en administrateur, que les jetons ne se
falsifient pas, et que la signature en ligne résiste aux abus.

Ces tests tournent uniquement sur une base locale jetable : aucun vrai
Gmail, WhatsApp ou compte Google n'est contacté.
"""

import json
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.models import TenantConfig
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm.auth import hash_password, issue_token
from zunqoo_voice.crm.db import (
    Approval,
    Contact,
    Invoice,
    Quote,
    QuoteSignature,
    User,
    session_scope,
)
from zunqoo_voice.crm.modules import ModuleKey
from zunqoo_voice.crm.services import set_modules
from zunqoo_voice.documents.signature import sign_token

PW = "motdepasse-solide-1"


def _tenant(base: TenantConfig, tid: str, name: str) -> TenantConfig:
    raw = json.loads(base.model_dump_json())
    raw |= {"id": tid, "whatsapp": {"manager_numbers": ["33600000000"]}}
    raw["profile"] = raw["profile"] | {"name": name}
    return TenantConfig.model_validate(raw)


@pytest.fixture
def env(tmp_path, tenant):
    """Tenant A (l'intrus) et tenant B (la cible), chacun avec ses données."""
    s = Settings(database_url=f"sqlite:///{tmp_path}/crm.sqlite3", tenants_dir=tmp_path / "t",
                 session_secret="x" * 48, mail_token_key="k" * 43 + "=",
                 crm_public_url="https://crm.test", admin_api_token="ADMIN-SECRET-TOKEN",
                 whatsapp_app_secret="meta-app-secret", whatsapp_verify_token="verifyme",
                 google_client_id="cid", google_client_secret="cs")
    store = FileTenantStore(s.tenants_dir)
    store.save(_tenant(tenant, "tenant-a", "Commerce A"))
    store.save(_tenant(tenant, "tenant-b", "Commerce B"))
    ids = {}
    with session_scope(s.database_url) as db:
        for tid, email, role in (("tenant-a", "intrus@a.fr", "admin"),
                                  ("tenant-a", "employe@a.fr", "membre"),
                                  ("tenant-b", "patron@b.fr", "admin")):
            u = User(tenant_id=tid, email=email, name=email, role=role,
                     password_hash=hash_password(PW))
            db.add(u)
            db.flush()
            ids[email] = u.id
        for tid in ("tenant-a", "tenant-b"):
            set_modules(db, tid, set(ModuleKey))
        # Données confidentielles du tenant B.
        c = Contact(tenant_id="tenant-b", first_name="Client", last_name="Secret",
                    email="secret@b.fr", phone="+33611111111", notes="Code porte 1234")
        db.add(c)
        db.flush()
        q = Quote(tenant_id="tenant-b", contact=c, title="Devis confidentiel B",
                  status="brouillon", lines=[])
        db.add(q)
        inv = Invoice(tenant_id="tenant-b", contact=c, kind="facture", title="Facture B")
        db.add(inv)
        appr = Approval(tenant_id="tenant-b", module="emails", kind="email_reponse",
                        title="Validation secrète B", summary="s",
                        payload={"mail_id": "m", "body": "secret"})
        db.add(appr)
        db.flush()
        ids |= {"contact_b": c.id, "quote_b": q.id, "invoice_b": inv.id, "approval_b": appr.id}
    s._ids = ids  # type: ignore[attr-defined]
    app.dependency_overrides[get_settings] = lambda: s
    yield s
    app.dependency_overrides.clear()


def tok(client, email):
    return {"Authorization": "Bearer " + client.post(
        "/api/auth/login", json={"email": email, "password": PW}).json()["token"]}


# --- 1. Cloisonnement entre commerces (le risque n°1 d'un SaaS multi-clients) ---

def test_tenant_cannot_read_another_tenants_data(env):
    c = TestClient(app)
    h = tok(c, "intrus@a.fr")  # admin du commerce A, pleinement authentifié
    i = env._ids
    for path in (f"/api/contacts/{i['contact_b']}", f"/api/quotes/{i['quote_b']}",
                 f"/api/quotes/{i['quote_b']}/pdf", f"/api/invoices/{i['invoice_b']}",
                 f"/api/invoices/{i['invoice_b']}/pdf"):
        r = c.get(path, headers=h)
        assert r.status_code == 404, f"FUITE inter-commerces sur {path}: {r.status_code}"


def test_tenant_cannot_modify_or_delete_another_tenants_data(env):
    c = TestClient(app)
    h = tok(c, "intrus@a.fr")
    i = env._ids
    assert c.patch(f"/api/contacts/{i['contact_b']}", json={"notes": "piraté"}, headers=h).status_code == 404
    assert c.patch(f"/api/quotes/{i['quote_b']}", json={"title": "piraté"}, headers=h).status_code == 404
    assert c.delete(f"/api/quotes/{i['quote_b']}", headers=h).status_code == 404
    assert c.post(f"/api/invoices/{i['invoice_b']}/payments",
                  json={"amount": 1, "method": "virement"}, headers=h).status_code == 404
    with session_scope(env.database_url) as db:
        assert db.get(Contact, i["contact_b"]).notes == "Code porte 1234"  # intact


def test_tenant_lists_only_its_own_data(env):
    c = TestClient(app)
    h = tok(c, "intrus@a.fr")
    assert c.get("/api/contacts", headers=h).json() == []
    assert c.get("/api/quotes", headers=h).json() == []
    assert c.get("/api/approvals?status=tous", headers=h).json() == []


def test_cannot_decide_another_tenants_approval(env):
    c = TestClient(app)
    h = tok(c, "intrus@a.fr")
    r = c.post(f"/api/approvals/{env._ids['approval_b']}/decision",
               json={"approve": True}, headers=h)
    assert r.status_code in (404, 409)
    with session_scope(env.database_url) as db:
        assert db.get(Approval, env._ids["approval_b"]).status == "en_attente"


# --- 2. Rôles : un employé n'est pas administrateur ---------------------------

def test_member_cannot_perform_admin_actions(env):
    c = TestClient(app)
    h = tok(c, "employe@a.fr")  # rôle « membre »
    assert c.patch("/api/business", json={"legal_name": "X"}, headers=h).status_code == 403
    assert c.patch("/api/modules/avis_google", json={"enabled": False}, headers=h).status_code == 403
    assert c.patch("/api/agenda/settings", json={"buffer_min": 0}, headers=h).status_code == 403
    assert c.patch("/api/extras/settings", json={"summary_time": "08:00"}, headers=h).status_code == 403
    assert c.post("/api/email/connect", headers=h).status_code == 403


def test_platform_admin_endpoints_need_the_admin_token(env):
    c = TestClient(app)
    user_h = tok(c, "intrus@a.fr")  # un jeton de commerce n'est pas le jeton plateforme
    for path in ("/tenants/tenant-b", "/billing/statement", "/calls/tenant-b/undelivered"):
        assert c.get(path, headers=user_h).status_code == 401
        assert c.get(path).status_code == 401
    ok = c.get("/tenants/tenant-b", headers={"Authorization": "Bearer ADMIN-SECRET-TOKEN"})
    assert ok.status_code == 200


# --- 3. Jetons de session : pas de falsification ------------------------------

def test_forged_and_tampered_tokens_are_rejected(env):
    c = TestClient(app)
    uid = env._ids["intrus@a.fr"]
    forged = jwt.encode({"sub": uid, "tid": "tenant-a",
                         "exp": datetime.now(UTC) + timedelta(hours=1)}, "mauvais-secret",
                        algorithm="HS256")
    assert c.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    # Attaque « alg=none » : un jeton non signé ne doit jamais passer.
    nosig = jwt.encode({"sub": uid, "tid": "tenant-a",
                        "exp": datetime.now(UTC) + timedelta(hours=1)}, "", algorithm="none")
    assert c.get("/api/me", headers={"Authorization": f"Bearer {nosig}"}).status_code == 401
    expired = issue_token(uid, "tenant-a", "x" * 48, -1)
    assert c.get("/api/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_bound_to_its_tenant(env):
    """Un jeton signé pour l'utilisateur A avec un tenant_id falsifié est rejeté."""
    c = TestClient(app)
    swapped = issue_token(env._ids["intrus@a.fr"], "tenant-b", "x" * 48, 12)
    assert c.get("/api/me", headers={"Authorization": f"Bearer {swapped}"}).status_code == 401


def test_login_does_not_leak_and_rejects_bad_password(env):
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": "patron@b.fr", "password": "faux"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "inconnu@x.fr", "password": PW}).status_code == 401
    r1 = c.post("/api/auth/login", json={"email": "patron@b.fr", "password": "faux"}).json()
    r2 = c.post("/api/auth/login", json={"email": "inconnu@x.fr", "password": PW}).json()
    assert r1["detail"] == r2["detail"]  # même message : pas d'énumération de comptes


# --- 4. Signature en ligne : le lien public est la seule clé ------------------

def _open_signature(env, tenant_id, quote_id):
    with session_scope(env.database_url) as db:
        q = db.get(Quote, quote_id)
        q.number = "DEV-2027-0001"
        q.status = "envoye"
        sig = QuoteSignature(tenant_id=tenant_id, quote=q, document_pdf=b"%PDF-1.4 fake",
                             document_sha256="a" * 64, otp_required=True,
                             signer_email=q.contact.email, events=[])
        db.add(sig)
        db.flush()
        return sign_token(env, sig), sig.id


def test_signature_link_cannot_be_forged_or_guessed(env):
    token, sig_id = _open_signature(env, "tenant-b", env._ids["quote_b"])
    c = TestClient(app)
    assert c.get(f"/api/public/signature/{token}").status_code == 200  # le vrai lien marche
    # Bon identifiant, mauvaise empreinte HMAC : rejeté.
    forged = f"{sig_id}-{'0' * 24}"
    assert c.get(f"/api/public/signature/{forged}").status_code == 404
    # Identifiant seul, sans empreinte : rejeté.
    assert c.get(f"/api/public/signature/{sig_id}").status_code == 404
    assert c.post(f"/api/public/signature/{forged}/sign",
                  json={"name": "Pirate", "signature": "data:image/png;base64,AAAA",
                        "accept": True}).status_code == 404


def test_signature_requires_email_code_before_signing(env):
    token, _ = _open_signature(env, "tenant-b", env._ids["quote_b"])
    c = TestClient(app)
    r = c.post(f"/api/public/signature/{token}/sign",
               json={"name": "Pirate", "signature": "data:image/png;base64,AAAA", "accept": True})
    assert r.status_code == 400 and "code" in r.json()["detail"].lower()


def test_signature_view_does_not_leak_full_email_or_otp(env):
    token, _ = _open_signature(env, "tenant-b", env._ids["quote_b"])
    c = TestClient(app)
    data = c.get(f"/api/public/signature/{token}").json()
    body = json.dumps(data)
    assert "secret@b.fr" not in body            # e-mail complet jamais exposé
    assert data["signature"]["email"].startswith("s") and "•" in data["signature"]["email"]
    assert "otp_hash" not in body and "otp" not in body.replace("otp_required", "").replace("otp_verified", "")


# --- 5. Webhook WhatsApp : signature Meta obligatoire -------------------------

def test_whatsapp_webhook_rejects_unsigned_and_wrongly_signed(env):
    c = TestClient(app)
    payload = b'{"entry":[]}'
    assert c.post("/webhooks/whatsapp", content=payload).status_code == 401
    assert c.post("/webhooks/whatsapp", content=payload,
                  headers={"X-Hub-Signature-256": "sha256=deadbeef"}).status_code == 401
    assert c.get("/webhooks/whatsapp",
                 params={"hub.mode": "subscribe", "hub.verify_token": "faux",
                         "hub.challenge": "123"}).status_code == 403


# --- 6. Validation des entrées -----------------------------------------------

def test_weak_password_refused_at_creation():
    with pytest.raises(ValueError):
        hash_password("court")


def test_contact_rejects_malformed_siren_and_vat(env):
    c = TestClient(app)
    h = tok(c, "intrus@a.fr")
    assert c.post("/api/contacts", json={"first_name": "X", "siren": "pas-un-siren"},
                  headers=h).status_code == 422
    assert c.post("/api/contacts", json={"first_name": "X", "vat_number": "'; DROP TABLE"},
                  headers=h).status_code == 422


# --- 7. Validation : seul le texte relu est modifiable -----------------------

def test_approval_edits_cannot_rewrite_routing_keys(env):
    """À la validation, le gérant peut corriger le texte, jamais la cible de l'action."""
    import asyncio

    from zunqoo_voice.crm.approvals import decide, executor

    seen: dict = {}

    @executor("probe_edit", editable=("body",))
    async def _probe(session, approval, settings):
        seen.clear()
        seen.update(approval.payload)
        return "ok"

    with session_scope(env.database_url) as db:
        a = Approval(tenant_id="tenant-a", module="emails", kind="probe_edit",
                     title="t", summary="s", payload={"mail_id": "LEGITIME", "body": "relu"})
        db.add(a)
        db.flush()
        aid = a.id

    async def run():
        with session_scope(env.database_url) as db:
            await decide(db, env, tenant_id="tenant-a", approval_id=aid, approve=True,
                         decided_by="intrus@a.fr", channel="web",
                         edits={"mail_id": "INJECTE", "body": "corrige", "montant": 99999})

    asyncio.run(run())
    assert seen["body"] == "corrige"          # le texte relu est bien pris en compte
    assert seen["mail_id"] == "LEGITIME"      # la cible de l'action n'a pas bougé
    assert "montant" not in seen              # aucune clé arbitraire injectée
