"""Routes du CRM : informations légales et devis."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..crm.api import DB, CurrentUser, require_admin, tenant_of
from ..crm.db import Approval, BusinessSettings, CatalogItem, Contact, Quote, User
from ..crm.services import add_interaction
from .pdf import fmt_money
from .quotes import (
    EDITABLE,
    QuoteError,
    business_settings,
    clean_lines,
    issue,
    line_from_catalog,
    missing_for_documents,
    quote_pdf,
    refresh_totals,
    send_quote_email,
)

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Informations légales
# ---------------------------------------------------------------------------

_BS_FIELDS = ("legal_name", "legal_form", "address", "postal_code", "city", "siret",
              "vat_number", "rcs", "capital", "email", "phone", "iban", "bic", "vat_franchise",
              "quote_validity_days", "payment_terms_days", "quote_terms", "invoice_terms")


class BusinessIn(BaseModel):
    legal_name: str | None = None
    legal_form: str | None = None
    address: str | None = None
    postal_code: str | None = Field(default=None, pattern=r"^\d{5}$")
    city: str | None = None
    siret: str | None = Field(default=None, pattern=r"^\d{14}$")
    vat_number: str | None = Field(default=None, pattern=r"^[A-Z]{2}[0-9A-Z]{2,13}$")
    rcs: str | None = None
    capital: str | None = None
    email: str | None = None
    phone: str | None = None
    iban: str | None = Field(default=None, pattern=r"^[A-Z]{2}\d{2}[0-9A-Z]{10,30}$")
    bic: str | None = None
    vat_franchise: bool | None = None
    quote_validity_days: int | None = Field(default=None, ge=1, le=365)
    payment_terms_days: int | None = Field(default=None, ge=0, le=60)  # plafond légal : 60 jours
    quote_terms: str | None = None
    invoice_terms: str | None = None


def _bs_out(bs: BusinessSettings) -> dict:
    return {**{f: getattr(bs, f) for f in _BS_FIELDS}, "missing": missing_for_documents(bs)}


@router.get("/business")
def get_business(user: CurrentUser, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    return _bs_out(business_settings(session, tenant_of(user, settings)))


@router.patch("/business")
def update_business(body: BusinessIn, session: DB, user: User = Depends(require_admin),
                    settings: Settings = Depends(get_settings)) -> dict:
    bs = business_settings(session, tenant_of(user, settings))
    for field, value in body.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip() or None
            if field in ("siret", "vat_number", "iban") and value:
                value = value.replace(" ", "").upper()
        setattr(bs, field, value)
    session.flush()
    return _bs_out(bs)


# ---------------------------------------------------------------------------
# Devis
# ---------------------------------------------------------------------------


class LineIn(BaseModel):
    description: str = ""
    detail: str | None = None
    catalog_item_id: str | None = None
    quantity: Decimal = Decimal(1)
    unit: str | None = None
    unit_price: Decimal | None = None
    vat_rate: Decimal | None = None


class QuoteIn(BaseModel):
    contact_id: str | None = None
    title: str | None = Field(default=None, max_length=255)
    lines: list[LineIn] | None = None
    prices_include_vat: bool | None = None
    notes: str | None = None
    internal_notes: str | None = None


def _q_out(q: Quote, *, full: bool = False) -> dict:
    out = {
        "id": q.id, "number": q.number, "status": q.status, "title": q.title,
        "total_ht": float(q.total_ht), "total_ttc": float(q.total_ttc),
        "prices_include_vat": q.prices_include_vat, "source": q.source,
        "contact": {"id": q.contact.id, "name": q.contact.display_name,
                    "email": q.contact.email} if q.contact else None,
        "issue_date": q.issue_date.isoformat() if q.issue_date else None,
        "valid_until": q.valid_until.isoformat() if q.valid_until else None,
        "sent_at": q.sent_at.isoformat() if q.sent_at else None,
        "created_at": q.created_at.isoformat(),
        "incomplete": any(ln.get("unit_price") is None for ln in q.lines),
    }
    if full:
        out |= {"lines": q.lines, "notes": q.notes, "internal_notes": q.internal_notes,
                "email_body": q.email_body, "reminders_sent": q.reminders_sent}
    return out


def _get_quote(session: Session, tenant_id: str, quote_id: str) -> Quote:
    q = session.get(Quote, quote_id)
    if q is None or q.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="devis introuvable")
    return q


def _apply(session: Session, q: Quote, body: QuoteIn, tenant_id: str,
           bs: BusinessSettings) -> None:
    data = body.model_dump(exclude_unset=True)
    if "contact_id" in data:
        contact = session.get(Contact, data["contact_id"]) if data["contact_id"] else None
        if data["contact_id"] and (contact is None or contact.tenant_id != tenant_id):
            raise HTTPException(status_code=400, detail="client introuvable")
        q.contact = contact
    for field in ("title", "notes", "internal_notes", "prices_include_vat"):
        if field in data:
            setattr(q, field, data[field] if field != "title" else (data[field] or ""))
    if "lines" in data:
        lines = []
        for line in body.lines or []:
            raw = line.model_dump()
            if line.catalog_item_id and line.unit_price is None:
                item = session.get(CatalogItem, line.catalog_item_id)
                if item is None or item.tenant_id != tenant_id:
                    raise HTTPException(status_code=400, detail="produit introuvable")
                raw = {**line_from_catalog(item, line.quantity,
                                           prices_include_vat=q.prices_include_vat,
                                           detail=line.detail),
                       **{k: v for k, v in raw.items() if v not in (None, "")}}
            lines.append(raw)
        try:
            q.lines = clean_lines(lines)
        except QuoteError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    refresh_totals(q, bs)


@router.get("/quotes")
def list_quotes(user: CurrentUser, session: DB, status: str = "tous") -> list[dict]:
    query = select(Quote).where(Quote.tenant_id == user.tenant_id)
    if status != "tous":
        query = query.where(Quote.status == status)
    return [_q_out(q) for q in session.scalars(query.order_by(Quote.created_at.desc()).limit(300))]


@router.post("/quotes", status_code=201)
def create_quote(body: QuoteIn, user: CurrentUser, session: DB,
                 settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    bs = business_settings(session, tenant)
    q = Quote(tenant_id=user.tenant_id, prices_include_vat=tenant.prices_include_vat, lines=[])
    session.add(q)
    _apply(session, q, body, user.tenant_id, bs)
    session.flush()
    return _q_out(q, full=True)


@router.get("/quotes/{quote_id}")
def get_quote(quote_id: str, user: CurrentUser, session: DB) -> dict:
    return _q_out(_get_quote(session, user.tenant_id, quote_id), full=True)


@router.patch("/quotes/{quote_id}")
def update_quote(quote_id: str, body: QuoteIn, user: CurrentUser, session: DB,
                 settings: Settings = Depends(get_settings)) -> dict:
    q = _get_quote(session, user.tenant_id, quote_id)
    if q.status not in EDITABLE:
        raise HTTPException(status_code=409,
                            detail="devis déjà envoyé : dupliquez-le pour faire une nouvelle version")
    _apply(session, q, body, user.tenant_id, business_settings(session, tenant_of(user, settings)))
    return _q_out(q, full=True)


@router.delete("/quotes/{quote_id}", status_code=204)
def delete_quote(quote_id: str, user: CurrentUser, session: DB) -> Response:
    q = _get_quote(session, user.tenant_id, quote_id)
    if q.status not in EDITABLE or q.number:
        raise HTTPException(status_code=409, detail="un devis numéroté se conserve : marquez-le refusé")
    _close_approvals(session, q, "refuse", user.email)
    session.delete(q)
    return Response(status_code=204)


@router.post("/quotes/{quote_id}/duplicate", status_code=201)
def duplicate_quote(quote_id: str, user: CurrentUser, session: DB,
                    settings: Settings = Depends(get_settings)) -> dict:
    src = _get_quote(session, user.tenant_id, quote_id)
    q = Quote(tenant_id=src.tenant_id, contact=src.contact, title=src.title,
              lines=list(src.lines), prices_include_vat=src.prices_include_vat, notes=src.notes)
    session.add(q)
    refresh_totals(q, business_settings(session, tenant_of(user, settings)))
    session.flush()
    return _q_out(q, full=True)


@router.get("/quotes/{quote_id}/pdf")
def quote_pdf_route(quote_id: str, user: CurrentUser, session: DB,
                    settings: Settings = Depends(get_settings)) -> Response:
    q = _get_quote(session, user.tenant_id, quote_id)
    pdf = quote_pdf(q, business_settings(session, tenant_of(user, settings)))
    name = f"Devis-{q.number or 'projet'}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{name}"'})


def _close_approvals(session: Session, q: Quote, status: str, by: str) -> None:
    """Le devis a été traité depuis l'éditeur : la validation en attente est close."""
    for a in session.scalars(select(Approval).where(
            Approval.tenant_id == q.tenant_id, Approval.status == "en_attente",
            Approval.kind.in_(("devis_envoi", "devis_relance")))):
        if a.payload.get("quote_id") == q.id:
            a.status, a.decided_by, a.decision_channel = status, by, "web"
            a.decided_at = datetime.now(UTC)


class SendIn(BaseModel):
    email_body: str | None = None
    by_email: bool = True  # False : le gérant l'envoie lui-même (PDF téléchargé)


@router.post("/quotes/{quote_id}/send")
async def send_quote(quote_id: str, body: SendIn, user: CurrentUser, session: DB,
                     settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    q = _get_quote(session, user.tenant_id, quote_id)
    if q.status not in EDITABLE:
        raise HTTPException(status_code=409, detail=f"devis déjà {q.status}")
    try:
        if body.by_email:
            await send_quote_email(session, settings, tenant, q, body.email_body or "")
        else:
            issue(session, q, business_settings(session, tenant), datetime.now(UTC))
            q.status, q.sent_at = "envoye", datetime.now(UTC)
            add_interaction(session, q.contact, tenant_id=tenant.id, channel="note",
                            direction="sortant", intent="devis",
                            title=f"Devis {q.number} remis au client ({fmt_money(q.total_ttc)} TTC)",
                            summary=q.title, data={"quote_id": q.id})
    except QuoteError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _close_approvals(session, q, "execute", user.email)
    return _q_out(q, full=True)


class StatusIn(BaseModel):
    status: str = Field(pattern="^(accepte|refuse)$")


@router.post("/quotes/{quote_id}/status")
def set_quote_status(quote_id: str, body: StatusIn, user: CurrentUser, session: DB) -> dict:
    q = _get_quote(session, user.tenant_id, quote_id)
    if q.status not in ("envoye", "expire", "accepte", "refuse"):
        raise HTTPException(status_code=409, detail="envoyez le devis avant de noter la réponse")
    q.status, q.decided_at = body.status, datetime.now(UTC)
    _close_approvals(session, q, "refuse", user.email)  # plus de relance
    add_interaction(session, q.contact, tenant_id=q.tenant_id, channel="note", direction="interne",
                    intent="devis",
                    title=f"Devis {q.number} {'accepté' if body.status == 'accepte' else 'refusé'}",
                    summary=q.title, data={"quote_id": q.id})
    return _q_out(q, full=True)
