"""Page publique de signature des devis (sans compte : le lien suffit)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..core.config import Settings, get_settings
from ..core.models import TenantConfig
from ..core.tenant_store import FileTenantStore
from ..crm.api import DB
from ..crm.db import QuoteSignature
from .quotes import business_settings, quote_view
from .signature import (
    SignatureError,
    accepted_mention,
    ensure_open,
    find_by_token,
    log_event,
    mask_email,
    refuse,
    send_code,
    sign,
    verify_code,
)

router = APIRouter(prefix="/api/public/signature")


def client_ip(request: Request) -> str | None:
    # Derrière le reverse proxy (Caddy/Nginx), l'adresse réelle est la première de la liste.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def _load(session, settings: Settings, token: str) -> tuple[QuoteSignature, TenantConfig]:
    try:
        sig = find_by_token(session, settings, token)
    except SignatureError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    tenant = FileTenantStore(settings.tenants_dir).get(sig.tenant_id)
    if tenant is None or not tenant.active:
        raise HTTPException(status_code=404, detail="lien de signature invalide")
    return sig, tenant


def _fail(exc: SignatureError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


def _money(v) -> float:
    return float(v)


@router.get("/{token}")
def view(token: str, request: Request, session: DB,
         settings: Settings = Depends(get_settings)) -> dict:
    sig, tenant = _load(session, settings, token)
    quote = sig.quote
    bs = business_settings(session, tenant)
    doc = quote_view(quote, bs)
    closed = None
    try:
        ensure_open(sig)
    except SignatureError as exc:
        closed = str(exc)
    # Journal : une consultation par tranche de 10 minutes suffit.
    last = next((e for e in reversed(sig.events or []) if e["event"] == "consulte"), None)
    if closed is None and (last is None or datetime.fromisoformat(last["at"])
                           < datetime.now(UTC) - timedelta(minutes=10)):
        log_event(sig, "consulte", client_ip(request))
    return {
        "business": {"name": tenant.profile.name, "legal_name": bs.legal_name,
                     "city": bs.city, "phone": bs.phone or tenant.profile.phone,
                     "email": bs.email},
        "quote": {
            "number": quote.number, "title": quote.title,
            "client": quote.contact.display_name if quote.contact else None,
            "issue_date": doc.issue_date.isoformat(),
            "valid_until": quote.valid_until.isoformat() if quote.valid_until else None,
            "prices_include_vat": quote.prices_include_vat, "vat_franchise": bs.vat_franchise,
            "lines": [{"description": ln.description, "detail": ln.detail,
                       "quantity": float(ln.quantity), "unit": ln.unit,
                       "unit_price": _money(ln.unit_price), "vat_rate": float(ln.vat_rate),
                       "total": _money(ln.total)} for ln in doc.lines],
            "total_ht": _money(doc.totals.total_ht), "total_vat": _money(doc.totals.total_vat),
            "total_ttc": _money(doc.totals.total_ttc),
            "notes": quote.notes, "mentions": doc.mentions,
        },
        "signature": {
            "mention": accepted_mention(quote),
            "status": sig.status, "closed": closed if sig.status == "ouvert" else None,
            "otp_required": sig.otp_required, "otp_verified": sig.otp_verified_at is not None,
            "email": mask_email(sig.signer_email),
            "signer_name": sig.signer_name,
            "signed_at": sig.signed_at.isoformat() if sig.signed_at else None,
        },
    }


@router.get("/{token}/document.pdf")
def document(token: str, session: DB, settings: Settings = Depends(get_settings)) -> Response:
    sig, _ = _load(session, settings, token)
    signed = sig.status == "signe" and sig.signed_pdf
    pdf = sig.signed_pdf if signed else sig.document_pdf
    name = f"Devis-{sig.quote.number}{'-signe' if signed else ''}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{name}"',
                             "Cache-Control": "no-store"})


@router.post("/{token}/code")
async def request_code(token: str, request: Request, session: DB,
                       settings: Settings = Depends(get_settings)) -> dict:
    sig, tenant = _load(session, settings, token)
    try:
        await send_code(session, settings, tenant, sig, client_ip(request))
    except SignatureError as exc:
        raise _fail(exc) from exc
    return {"sent_to": mask_email(sig.signer_email)}


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


@router.post("/{token}/code/verify")
def check_code(token: str, body: CodeIn, request: Request, session: DB,
               settings: Settings = Depends(get_settings)) -> dict:
    sig, _ = _load(session, settings, token)
    try:
        verify_code(settings, sig, body.code, client_ip(request))
    except SignatureError as exc:
        session.commit()  # garde la trace de l'essai erroné malgré le refus
        raise _fail(exc) from exc
    return {"verified": True}


class SignIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    signature: str = Field(max_length=450_000)  # data:image/png;base64,…
    accept: bool


@router.post("/{token}/sign")
async def sign_quote(token: str, body: SignIn, request: Request, session: DB,
                     settings: Settings = Depends(get_settings)) -> dict:
    if not body.accept:
        raise HTTPException(status_code=400, detail="cochez « Bon pour accord » pour signer")
    sig, tenant = _load(session, settings, token)
    try:
        await sign(session, settings, tenant, sig, name=body.name, role=body.role,
                   signature_png=body.signature, ip=client_ip(request),
                   user_agent=request.headers.get("user-agent"))
    except SignatureError as exc:
        raise _fail(exc) from exc
    return {"status": sig.status, "signed_at": sig.signed_at.isoformat()}


class RefuseIn(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


@router.post("/{token}/refuse")
async def refuse_quote(token: str, body: RefuseIn, request: Request, session: DB,
                       settings: Settings = Depends(get_settings)) -> dict:
    sig, tenant = _load(session, settings, token)
    try:
        await refuse(session, settings, tenant, sig, reason=body.reason, ip=client_ip(request),
                     user_agent=request.headers.get("user-agent"))
    except SignatureError as exc:
        raise _fail(exc) from exc
    return {"status": sig.status}
