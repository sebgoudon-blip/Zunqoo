import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from zunqoo_voice.api.app import app
from zunqoo_voice.core.config import Settings, get_settings
from zunqoo_voice.core.models import CallIntent, CallRecord, CallReport, OrderLine
from zunqoo_voice.core.tenant_store import FileTenantStore
from zunqoo_voice.crm import approvals as approvals_mod
from zunqoo_voice.crm.auth import hash_password
from zunqoo_voice.crm.db import Approval, CatalogItem, User, session_scope
from zunqoo_voice.crm.modules import ModuleConfigError, ModuleKey
from zunqoo_voice.crm.services import (
    catalog_as_products,
    create_approval,
    enabled_modules,
    import_catalog_csv,
    parse_price,
    record_call,
    seed_catalog_from_profile,
    set_modules,
    toggle_module,
)

PASSWORD = "motdepasse-solide"


@pytest.fixture
def settings(tmp_path, tenant):
    s = Settings(
        database_url=f"sqlite:///{tmp_path}/crm.sqlite3",
        tenants_dir=tmp_path / "tenants",
        session_secret="x" * 40,
        whatsapp_app_secret="app-secret",
        whatsapp_access_token="TOKEN",
        whatsapp_phone_number_id="PNID",
    )
    store = FileTenantStore(s.tenants_dir)
    store.save(tenant)
    other = tenant.model_copy(deep=True)
    other.id = "autre-commerce"
    other.whatsapp.manager_numbers = ["33699999999"]
    store.save(other)
    return s


@pytest.fixture
def client(settings):
    app.dependency_overrides[get_settings] = lambda: settings
    with session_scope(settings.database_url) as db:
        for tid, email in (("rotisserie-demo", "gerant@roti.fr"), ("autre-commerce", "x@y.fr")):
            db.add(User(tenant_id=tid, email=email, name="Paul",
                        password_hash=hash_password(PASSWORD)))
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, email="gerant@roti.fr"):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# --- modules ---------------------------------------------------------------


def test_modules_defaults_dependencies_and_cascade(settings):
    with session_scope(settings.database_url) as db:
        assert enabled_modules(db, "t1") == {ModuleKey.PHONE, ModuleKey.ORDERS}
        toggle_module(db, "t1", ModuleKey.PHONE, False)  # coupe aussi les commandes
        assert enabled_modules(db, "t1") == set()
        toggle_module(db, "t1", ModuleKey.ORDERS, True)  # réactive le téléphone requis
        assert enabled_modules(db, "t1") == {ModuleKey.PHONE, ModuleKey.ORDERS}
        with pytest.raises(ModuleConfigError):
            set_modules(db, "t1", {ModuleKey.ORDERS})
        with pytest.MonkeyPatch.context() as mp, pytest.raises(ModuleConfigError):
            _unavailable(mp, ModuleKey.DAILY_SUMMARY)  # module pas encore livré
            set_modules(db, "t1", {ModuleKey.PHONE, ModuleKey.DAILY_SUMMARY})


def _unavailable(mp: pytest.MonkeyPatch, key: ModuleKey) -> None:
    from dataclasses import replace

    from zunqoo_voice.crm.modules import MODULES

    mp.setitem(MODULES, key, replace(MODULES[key], available=False))


# --- catalogue ---------------------------------------------------------------


@pytest.mark.parametrize("raw,expected", [
    ("12,90 €", Decimal("12.90")), ("1 250,00", Decimal("1250.00")),
    ("1.250,5", Decimal("1250.50")), (16.5, Decimal("16.50")), ("", None),
])
def test_parse_price(raw, expected):
    assert parse_price(raw) == expected


def test_seed_keeps_site_prices_as_ttc(settings, tenant):
    with session_scope(settings.database_url) as db:
        assert seed_catalog_from_profile(db, tenant.id, tenant.profile, vat_rate=5.5) == 5
        assert seed_catalog_from_profile(db, tenant.id, tenant.profile) == 0  # jamais écrasé
        products = catalog_as_products(
            list(db.query(CatalogItem).filter_by(tenant_id=tenant.id)))
    poulet = next(p for p in products if p.name.startswith("Poulet"))
    assert poulet.price == 16.5  # l'agent annonce le prix du site, sans arrondi


def test_csv_import_french_excel(settings):
    content = (
        "﻿Désignation;Catégorie;Prix HT;TVA;Unité\n"
        "Plateau apéritif;Traiteur;20,00;10 %;plateau\n"
        "Poulet fermier;Volailles;;;pièce\n"
        "Erreur;;abc;;\n"
    ).encode()
    with session_scope(settings.database_url) as db:
        res = import_catalog_csv(db, "t1", content)
        assert (res.created, res.updated, len(res.errors)) == (2, 0, 1)
        item = db.query(CatalogItem).filter_by(tenant_id="t1", name="Plateau apéritif").one()
        assert (item.price_ht, item.price_ttc, item.price_includes_vat) == (
            Decimal("20.00"), Decimal("22.00"), False)
        res = import_catalog_csv(db, "t1", b"nom;prix\nPoulet fermier;16,50\n")
        assert (res.created, res.updated) == (0, 1)
        item = db.query(CatalogItem).filter_by(tenant_id="t1", name="Poulet fermier").one()
        assert item.price_ttc == Decimal("16.50")


# --- appels -> CRM --------------------------------------------------------


def test_record_call_creates_then_reuses_contact(settings):
    now = datetime(2026, 10, 23, 10, tzinfo=UTC)
    report = CallReport(intent=CallIntent.ORDER, customer_first_name="Jean",
                        customer_last_name="Dupont", summary="2 poulets samedi",
                        order_lines=[OrderLine(product="Poulet", quantity=2)])
    rec = CallRecord(tenant_id="t1", call_id="c1", caller_number="+33612345678",
                     started_at=now, ended_at=now, duration_s=80, transcript="…", report=report)
    with session_scope(settings.database_url) as db:
        first = record_call(db, rec)
        second = record_call(db, rec.model_copy(update={"call_id": "c2", "report": None,
                                                         "caller_number": "06 12 34 56 78"}))
        assert first.contact_id == second.contact_id
        assert first.contact.display_name == "Jean Dupont"
        assert first.title == "Commande par téléphone"


# --- API ---------------------------------------------------------------------


def test_login_rejects_bad_password(client):
    r = client.post("/api/auth/login", json={"email": "gerant@roti.fr", "password": "faux"})
    assert r.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_api_modules_and_catalog_flow(client):
    h = login(client)
    me = client.get("/api/me", headers=h).json()
    assert me["business"]["name"] == "La Rôtisserie du Marché"
    assert me["modules"] == ["commandes", "telephone"]

    r = client.patch("/api/modules/commandes", json={"enabled": False}, headers=h)
    assert {m["key"]: m["enabled"] for m in r.json()["modules"]}["commandes"] is False
    with pytest.MonkeyPatch.context() as mp:
        _unavailable(mp, ModuleKey.DAILY_SUMMARY)
        assert client.patch("/api/modules/resume_quotidien", json={"enabled": True},
                            headers=h).status_code == 400

    r = client.post("/api/catalog", json={"name": "Pintade", "price": 19}, headers=h)
    assert r.status_code == 201
    item = r.json()
    assert (item["price_ttc"], item["vat_rate"]) == (19.0, 5.5)  # défauts du commerce
    r = client.patch(f"/api/catalog/{item['id']}", json={"price": 21.5}, headers=h)
    assert r.json()["price_ttc"] == 21.5
    r = client.post("/api/catalog/import", headers=h,
                    files={"file": ("c.csv", b"nom;prix\nJarret;7,50\n", "text/csv")})
    assert r.json()["created"] == 1
    assert len(client.get("/api/catalog", headers=h).json()) == 2


def test_tenants_are_isolated(client):
    h1, h2 = login(client), login(client, "x@y.fr")
    item = client.post("/api/catalog", json={"name": "Secret"}, headers=h1).json()
    contact = client.post("/api/contacts", json={"first_name": "Ana"}, headers=h1).json()
    assert client.get("/api/catalog", headers=h2).json() == []
    assert client.get("/api/contacts", headers=h2).json() == []
    assert client.get(f"/api/contacts/{contact['id']}", headers=h2).status_code == 404
    assert client.patch(f"/api/catalog/{item['id']}", json={"name": "X"},
                        headers=h2).status_code == 404
    assert client.delete(f"/api/catalog/{item['id']}", headers=h2).status_code == 404


def test_contact_notes_and_search(client):
    h = login(client)
    c = client.post("/api/contacts", json={"first_name": "Lucie", "phone": "06 11 22 33 44"},
                    headers=h).json()
    assert c["phone"] == "+33611223344"
    client.post(f"/api/contacts/{c['id']}/notes", json={"text": "Allergique aux noix"}, headers=h)
    detail = client.get(f"/api/contacts/{c['id']}", headers=h).json()
    assert detail["interactions"][0]["summary"] == "Allergique aux noix"
    assert [x["name"] for x in client.get("/api/contacts?q=luc", headers=h).json()] == ["Lucie"]


# --- validations --------------------------------------------------------------


@pytest.fixture
def pending(settings):
    calls = []

    @approvals_mod.executor("test_envoi", editable=("body",))
    async def _run(db, approval, s):
        calls.append(approval.payload)
        return "envoyé"

    with session_scope(settings.database_url) as db:
        a = create_approval(db, tenant_id="rotisserie-demo", module=ModuleKey.ORDERS,
                            kind="test_envoi", title="Devis Dupont", summary="3 plateaux",
                            payload={"montant": 60, "body": "texte initial"})
    return a.id, calls


def test_web_decision_runs_once(client, pending):
    approval_id, calls = pending
    h = login(client)
    assert [a["id"] for a in client.get("/api/approvals", headers=h).json()] == [approval_id]
    # Le gérant corrige le texte (body) ; une clé non autorisée (montant) est ignorée.
    r = client.post(f"/api/approvals/{approval_id}/decision",
                    json={"approve": True, "edits": {"body": "texte corrigé", "montant": 55}}, headers=h)
    assert r.json()["status"] == "execute" and r.json()["decision_channel"] == "web"
    assert calls == [{"montant": 60, "body": "texte corrigé"}]
    again = client.post(f"/api/approvals/{approval_id}/decision", json={"approve": True},
                        headers=h)
    assert again.status_code == 409 and len(calls) == 1
    other = login(client, "x@y.fr")
    assert client.get("/api/approvals?status=tous", headers=other).json() == []


def _signed(body: dict, secret: str = "app-secret") -> tuple[bytes, dict]:
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return raw, {"x-hub-signature-256": f"sha256={sig}", "content-type": "application/json"}


def _click(sender: str, payload: str) -> dict:
    return {"entry": [{"changes": [{"value": {"messages": [
        {"from": sender, "type": "button", "button": {"payload": payload, "text": "Valider"}}
    ]}}]}]}


def test_whatsapp_webhook_security_and_decision(client, pending, settings, respx_mock):
    approval_id, calls = pending
    respx_mock.post("https://graph.facebook.com/v21.0/PNID/messages").respond(
        200, json={"messages": [{"id": "wamid.ack"}]})

    raw, headers = _signed(_click("33612345678", f"ok:{approval_id}"), secret="mauvais")
    assert client.post("/webhooks/whatsapp", content=raw, headers=headers).status_code == 401

    raw, headers = _signed(_click("33699999999", f"ok:{approval_id}"))  # gérant d'un autre commerce
    assert client.post("/webhooks/whatsapp", content=raw, headers=headers).status_code == 200
    assert calls == []

    raw, headers = _signed(_click("33612345678", f"ok:{approval_id}"))
    assert client.post("/webhooks/whatsapp", content=raw, headers=headers).status_code == 200
    assert calls == [{"montant": 60, "body": "texte initial"}]
    with session_scope(settings.database_url) as db:
        a = db.get(Approval, approval_id)
        assert (a.status, a.decision_channel) == ("execute", "whatsapp")


# --- Ma journée ---------------------------------------------------------------


def _order_call(db, call_id, *, called, day=None, iso=None, qty=2, phone="+33612345678",
                callback=False):
    report = CallReport(
        intent=CallIntent.ORDER, customer_first_name="Jean", summary="commande",
        order_lines=[OrderLine(product="Poulet fermier", quantity=qty)],
        requested_day=day, requested_date=iso, needs_callback=callback,
    )
    return record_call(db, CallRecord(
        tenant_id="t1", call_id=call_id, caller_number=phone, started_at=called,
        ended_at=called, duration_s=60, transcript="…", report=report))


def test_resolve_order_date():
    from datetime import date

    from zunqoo_voice.crm.today import resolve_order_date
    thursday = date(2026, 10, 22)
    assert resolve_order_date({"requested_day": "samedi matin"}, thursday) == date(2026, 10, 24)
    assert resolve_order_date({"requested_day": "demain midi"}, thursday) == date(2026, 10, 23)
    assert resolve_order_date({"requested_date": "2026-11-02"}, thursday) == date(2026, 11, 2)
    assert resolve_order_date({"requested_day": "dès que possible"}, thursday) is None


def test_today_overview_groups_orders_and_callbacks(settings):
    from zunqoo_voice.crm.today import mark_handled, today_overview
    now = datetime(2026, 10, 22, 9, 0, tzinfo=UTC)  # jeudi
    mods = {ModuleKey.PHONE, ModuleKey.ORDERS}
    with session_scope(settings.database_url) as db:
        _order_call(db, "a", called=now - timedelta(days=1), day="samedi matin", qty=2)
        _order_call(db, "b", called=now - timedelta(hours=1), day="samedi", qty=3,
                    phone="+33600000001")
        _order_call(db, "c", called=now - timedelta(hours=2), day="aujourd'hui midi", qty=1,
                    phone="+33600000002", callback=True)
        _order_call(db, "d", called=now - timedelta(hours=3), day=None, phone="+33600000003")
        done = _order_call(db, "e", called=now, day="samedi", qty=9, phone="+33600000004")
        mark_handled(db, "t1", done.id, "gerant")

        view = today_overview(db, "t1", "Europe/Paris", mods, now=now)
        days = {d["label"]: d for d in view["orders"]["upcoming"]}
        assert list(days) == ["Aujourd'hui 22 octobre", "Samedi 24 octobre"]
        assert days["Samedi 24 octobre"]["totals"] == [
            {"product": "Poulet fermier", "unit": None, "quantity": 5}]  # retirée exclue
        assert len(view["orders"]["undated"]) == 1
        assert [c["contact"]["phone"] for c in view["todo"]["callbacks"]] == ["+33600000002"]
        assert view["today"]["calls"] == 4

        assert today_overview(db, "t1", "Europe/Paris", {ModuleKey.PHONE}, now=now)["orders"] is None


def test_today_api_and_handled(client):
    h = login(client)
    view = client.get("/api/today", headers=h).json()
    assert view["todo"]["approvals_count"] == 0 and view["orders"] == {"upcoming": [], "undated": []}
    assert client.post("/api/interactions/inconnu/handled", json={"done": True},
                       headers=h).status_code == 404
