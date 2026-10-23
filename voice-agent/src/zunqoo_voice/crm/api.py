"""API du CRM (utilisée par l'application web ``apps/crm``).

Chaque route est authentifiée par un jeton de session et limitée au
commerce de l'utilisateur connecté : un client ne voit jamais les données
d'un autre.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..core.models import TenantConfig
from ..core.tenant_store import FileTenantStore
from . import services
from .approvals import ApprovalError, decide
from .auth import issue_token, read_token, verify_password
from .db import Approval, CatalogItem, Contact, Interaction, User, session_scope
from .modules import MODULES, PRESETS, Autonomy, ModuleConfigError, ModuleKey, preset_selection
from .today import mark_handled, today_overview

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Dépendances : session DB, utilisateur, tenant
# ---------------------------------------------------------------------------


def db(settings: Settings = Depends(get_settings)) -> Iterator[Session]:
    with session_scope(settings.database_url) as session:
        yield session


DB = Annotated[Session, Depends(db)]


def current_user(
    session: DB,
    settings: Settings = Depends(get_settings),
    authorization: str = Header(default=""),
) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    try:
        claims = read_token(token, settings.session_secret.get_secret_value())
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="session expirée, reconnectez-vous") from exc
    user = session.get(User, claims["sub"])
    if user is None or not user.active or user.tenant_id != claims.get("tid"):
        raise HTTPException(status_code=401, detail="compte inactif")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="réservé à l'administrateur")
    return user


def tenant_of(user: User, settings: Settings) -> TenantConfig:
    tenant = FileTenantStore(settings.tenants_dir).get(user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="commerce introuvable")
    return tenant


# ---------------------------------------------------------------------------
# Authentification
# ---------------------------------------------------------------------------


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/auth/login")
def login(body: LoginIn, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    user = session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="e-mail ou mot de passe incorrect")
    token = issue_token(user.id, user.tenant_id, settings.session_secret.get_secret_value(),
                        settings.session_hours)
    return {"token": token}


@router.get("/me")
def me(user: CurrentUser, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    enabled = services.enabled_modules(session, user.tenant_id)
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
        "business": {"id": tenant.id, "name": tenant.profile.name,
                     "activity": tenant.profile.activity,
                     "default_vat_rate": tenant.default_vat_rate,
                     "prices_include_vat": tenant.prices_include_vat,
                     "timezone": tenant.timezone},
        "modules": sorted(k.value for k in enabled),
    }


# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------


def _modules_out(states: dict[ModuleKey, services.ModuleState]) -> dict:
    return {
        "modules": [
            {
                "key": key.value, "label": mod.label, "description": mod.description,
                "requires": [r.value for r in mod.requires], "available": mod.available,
                "has_autonomy": mod.has_autonomy, "enabled": states[key].enabled,
                "autonomy": states[key].autonomy.value,
            }
            for key, mod in MODULES.items()
        ],
        "presets": [
            {"key": k, "label": label, "modules": [m.value for m in mods]}
            for k, (label, mods) in PRESETS.items()
        ],
    }


@router.get("/modules")
def list_modules(user: CurrentUser, session: DB) -> dict:
    return _modules_out(services.get_modules(session, user.tenant_id))


class ToggleIn(BaseModel):
    enabled: bool | None = None
    autonomy: Autonomy | None = None


@router.patch("/modules/{key}")
def update_module(key: ModuleKey, body: ToggleIn, session: DB,
                  user: User = Depends(require_admin)) -> dict:
    try:
        states = services.get_modules(session, user.tenant_id)
        if body.enabled is not None:
            states = services.toggle_module(session, user.tenant_id, key, body.enabled)
        if body.autonomy is not None:
            enabled = {k for k, s in states.items() if s.enabled}
            states = services.set_modules(session, user.tenant_id, enabled, {key: body.autonomy})
    except ModuleConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _modules_out(states)


class PresetIn(BaseModel):
    preset: str


@router.post("/modules/preset")
def apply_preset(body: PresetIn, session: DB, user: User = Depends(require_admin)) -> dict:
    try:
        states = services.set_modules(session, user.tenant_id, preset_selection(body.preset))
    except ModuleConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _modules_out(states)


# ---------------------------------------------------------------------------
# Tableau de bord
# ---------------------------------------------------------------------------


def _interaction_out(i: Interaction) -> dict:
    return {
        "id": i.id, "channel": i.channel, "direction": i.direction, "intent": i.intent,
        "title": i.title, "summary": i.summary, "occurred_at": i.occurred_at.isoformat(),
        "contact": {"id": i.contact.id, "name": i.contact.display_name} if i.contact else None,
        "data": i.data,
    }


@router.get("/dashboard")
def dashboard(user: CurrentUser, session: DB) -> dict:
    tid = user.tenant_id
    since_day = datetime.now(UTC) - timedelta(days=1)
    since_week = datetime.now(UTC) - timedelta(days=7)

    def count(q) -> int:
        return session.scalar(select(func.count()).select_from(q.subquery())) or 0

    calls = select(Interaction).where(Interaction.tenant_id == tid, Interaction.channel == "appel")
    recent = session.scalars(
        select(Interaction).where(Interaction.tenant_id == tid)
        .order_by(Interaction.occurred_at.desc()).limit(10)
    )
    return {
        "pending_approvals": count(select(Approval).where(
            Approval.tenant_id == tid, Approval.status == "en_attente")),
        "calls_24h": count(calls.where(Interaction.occurred_at >= since_day)),
        "orders_7d": count(calls.where(Interaction.intent == "commande",
                                       Interaction.occurred_at >= since_week)),
        "contacts": count(select(Contact).where(Contact.tenant_id == tid)),
        "recent": [_interaction_out(i) for i in recent],
    }


@router.get("/today")
def today(user: CurrentUser, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    """« Ma journée » : à faire, commandes à préparer, chiffres du jour."""
    tenant = tenant_of(user, settings)
    return today_overview(session, user.tenant_id, tenant.timezone,
                          services.enabled_modules(session, user.tenant_id))


class HandledIn(BaseModel):
    done: bool = True


@router.post("/interactions/{interaction_id}/handled")
def set_handled(interaction_id: str, body: HandledIn, user: CurrentUser, session: DB) -> dict:
    """Rappel passé / commande retirée (ou annulation de ce marquage)."""
    item = mark_handled(session, user.tenant_id, interaction_id, user.email, body.done)
    if item is None:
        raise HTTPException(status_code=404, detail="élément introuvable")
    return {"id": item.id, "handled": body.done}


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------


class ContactIn(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    company: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    siren: str | None = Field(default=None, pattern=r"^\d{9}(\d{5})?$")
    vat_number: str | None = Field(default=None, pattern=r"^[A-Z]{2}[0-9A-Z]{2,13}$")
    notes: str | None = None
    tags: list[str] | None = None


def _contact_out(c: Contact) -> dict:
    return {
        "id": c.id, "name": c.display_name, "first_name": c.first_name,
        "last_name": c.last_name, "company": c.company, "phone": c.phone, "email": c.email,
        "address": c.address, "siren": c.siren, "vat_number": c.vat_number,
        "notes": c.notes, "tags": c.tags or [],
        "created_at": c.created_at.isoformat(),
        "last_interaction_at": c.last_interaction_at.isoformat()
        if c.last_interaction_at else None,
    }


def _get_contact(session: Session, tenant_id: str, contact_id: str) -> Contact:
    contact = session.get(Contact, contact_id)
    if contact is None or contact.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="fiche introuvable")
    return contact


@router.get("/contacts")
def list_contacts(user: CurrentUser, session: DB, q: str = "") -> list[dict]:
    query = select(Contact).where(Contact.tenant_id == user.tenant_id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Contact.first_name.ilike(like), Contact.last_name.ilike(like),
                                Contact.company.ilike(like), Contact.phone.ilike(like),
                                Contact.email.ilike(like)))
    query = query.order_by(Contact.last_interaction_at.desc().nulls_last(),
                           Contact.created_at.desc()).limit(200)
    return [_contact_out(c) for c in session.scalars(query)]


@router.post("/contacts", status_code=201)
def create_contact(body: ContactIn, user: CurrentUser, session: DB) -> dict:
    data = body.model_dump(exclude_none=True)
    if data.get("phone"):
        data["phone"] = services.normalize_number(data["phone"])
    contact = Contact(tenant_id=user.tenant_id, **data)
    session.add(contact)
    session.flush()
    return _contact_out(contact)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: str, user: CurrentUser, session: DB) -> dict:
    contact = _get_contact(session, user.tenant_id, contact_id)
    return {**_contact_out(contact),
            "interactions": [_interaction_out(i) | {"body": i.body}
                             for i in contact.interactions]}


@router.patch("/contacts/{contact_id}")
def update_contact(contact_id: str, body: ContactIn, user: CurrentUser, session: DB) -> dict:
    contact = _get_contact(session, user.tenant_id, contact_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "phone" and value:
            value = services.normalize_number(value)
        setattr(contact, field, value)
    session.flush()
    return _contact_out(contact)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


@router.post("/contacts/{contact_id}/notes", status_code=201)
def add_note(contact_id: str, body: NoteIn, user: CurrentUser, session: DB) -> dict:
    contact = _get_contact(session, user.tenant_id, contact_id)
    note = services.add_interaction(
        session, contact, tenant_id=user.tenant_id, channel="note", direction="interne",
        title=f"Note de {user.name or user.email}", summary=body.text,
    )
    return _interaction_out(note)


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------


class CatalogIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    description: str | None = None
    unit: str | None = None
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    price_includes_vat: bool | None = None
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    availability: str | None = None
    active: bool | None = None


def _money(d: Decimal | None) -> float | None:
    return float(d) if d is not None else None


def _item_out(i: CatalogItem) -> dict:
    return {
        "id": i.id, "name": i.name, "category": i.category, "description": i.description,
        "unit": i.unit, "price": _money(i.price), "price_includes_vat": i.price_includes_vat,
        "vat_rate": _money(i.vat_rate), "price_ht": _money(i.price_ht),
        "price_ttc": _money(i.price_ttc), "availability": i.availability,
        "active": i.active, "source": i.source,
    }


def _get_item(session: Session, tenant_id: str, item_id: str) -> CatalogItem:
    item = session.get(CatalogItem, item_id)
    if item is None or item.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="produit introuvable")
    return item


@router.get("/catalog")
def get_catalog(user: CurrentUser, session: DB) -> list[dict]:
    return [_item_out(i) for i in services.list_catalog(session, user.tenant_id)]


@router.post("/catalog", status_code=201)
def create_item(body: CatalogIn, user: CurrentUser, session: DB,
                settings: Settings = Depends(get_settings)) -> dict:
    if not body.name:
        raise HTTPException(status_code=400, detail="le nom du produit est obligatoire")
    tenant = tenant_of(user, settings)
    data = body.model_dump(exclude_none=True)
    data.setdefault("vat_rate", Decimal(str(tenant.default_vat_rate)))
    data.setdefault("price_includes_vat", tenant.prices_include_vat)
    item = CatalogItem(tenant_id=user.tenant_id, source="manuel", **data)
    session.add(item)
    session.flush()
    return _item_out(item)


@router.patch("/catalog/{item_id}")
def update_item(item_id: str, body: CatalogIn, user: CurrentUser, session: DB) -> dict:
    item = _get_item(session, user.tenant_id, item_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "name" and not value:
            raise HTTPException(status_code=400, detail="le nom du produit est obligatoire")
        setattr(item, field, value)
    session.flush()
    return _item_out(item)


@router.delete("/catalog/{item_id}", status_code=204)
def delete_item(item_id: str, user: CurrentUser, session: DB) -> Response:
    session.delete(_get_item(session, user.tenant_id, item_id))
    return Response(status_code=204)


@router.post("/catalog/import")
async def import_catalog(user: CurrentUser, session: DB, file: UploadFile = File(...),
                         settings: Settings = Depends(get_settings)) -> dict:
    content = await file.read(2_000_001)
    if len(content) > 2_000_000:
        raise HTTPException(status_code=413, detail="fichier trop volumineux (2 Mo max)")
    tenant = tenant_of(user, settings)
    result = services.import_catalog_csv(session, user.tenant_id, content,
                                         default_vat_rate=tenant.default_vat_rate,
                                         prices_include_vat=tenant.prices_include_vat)
    return {"created": result.created, "updated": result.updated, "errors": result.errors}


@router.get("/catalog/modele.csv")
def catalog_template(user: CurrentUser) -> Response:
    sample = ("nom;categorie;prix;unite;tva;description;disponibilite\n"
              "Poulet fermier;Volailles;16,50;pièce;5,5;Label Rouge;week-end\n")
    return Response(content="﻿" + sample, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="modele-catalogue.csv"'})


# ---------------------------------------------------------------------------
# Validations
# ---------------------------------------------------------------------------


def _approval_out(a: Approval) -> dict:
    return {
        "id": a.id, "module": a.module, "kind": a.kind, "title": a.title, "summary": a.summary,
        "payload": a.payload, "status": a.status, "created_at": a.created_at.isoformat(),
        "decided_at": a.decided_at.isoformat() if a.decided_at else None,
        "decided_by": a.decided_by, "decision_channel": a.decision_channel, "result": a.result,
        "contact": {"id": a.contact.id, "name": a.contact.display_name} if a.contact else None,
    }


@router.get("/approvals")
def list_approvals(user: CurrentUser, session: DB, status: str = "en_attente") -> list[dict]:
    query = select(Approval).where(Approval.tenant_id == user.tenant_id)
    if status != "tous":
        query = query.where(Approval.status == status)
    return [_approval_out(a) for a in
            session.scalars(query.order_by(Approval.created_at.desc()).limit(200))]


class DecisionIn(BaseModel):
    approve: bool
    edits: dict | None = None


@router.post("/approvals/{approval_id}/decision")
async def decide_approval(approval_id: str, body: DecisionIn, user: CurrentUser, session: DB,
                          settings: Settings = Depends(get_settings)) -> dict:
    try:
        approval = await decide(
            session, settings, tenant_id=user.tenant_id, approval_id=approval_id,
            approve=body.approve, decided_by=user.email, channel="web", edits=body.edits,
        )
    except ApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _approval_out(approval)
