"""Routes « E-mails » du CRM : connexion Gmail, état, relève immédiate."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from ..core.config import Settings, get_settings
from ..crm.api import DB, CurrentUser, require_admin, tenant_of
from ..crm.db import MailAccount, MailMessage, User, session_scope
from .crypto import MailCryptoError, encrypt
from .google_oauth import GoogleAuthError, authorization_url, exchange_code, read_state, revoke
from .processor import _ACCESS, get_account, sync_tenant

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/email/status")
def email_status(user: CurrentUser, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    account = get_account(session, user.tenant_id)
    since = datetime.combine(datetime.now(UTC).date(), time.min, UTC)
    counts = dict(session.execute(
        select(MailMessage.status, func.count()).where(
            MailMessage.tenant_id == user.tenant_id, MailMessage.received_at >= since)
        .group_by(MailMessage.status)
    ).all())
    return {
        "configured": bool(settings.google_client_id and settings.mail_token_key.get_secret_value()),
        "connected": account is not None,
        "email": account.email if account else None,
        "last_sync_at": account.last_sync_at.isoformat() if account and account.last_sync_at else None,
        "last_error": account.last_error if account else None,
        "today": counts,
    }


@router.post("/api/email/connect")
def email_connect(user: User = Depends(require_admin),
                  settings: Settings = Depends(get_settings)) -> dict:
    try:
        return {"url": authorization_url(settings, tenant_id=user.tenant_id, user_id=user.id)}
    except GoogleAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/email/disconnect")
async def email_disconnect(session: DB, user: User = Depends(require_admin),
                           settings: Settings = Depends(get_settings)) -> dict:
    account = get_account(session, user.tenant_id)
    if account is None:
        return {"connected": False}
    try:
        from .crypto import decrypt
        await revoke(decrypt(settings, account.refresh_token_enc))
    except Exception:  # noqa: BLE001 - on déconnecte quand même côté Zunqoo
        log.warning("révocation Google échouée pour %s", user.tenant_id)
    account.active = False
    _ACCESS.pop(user.tenant_id, None)
    return {"connected": False}


@router.post("/api/email/sync")
async def email_sync(user: CurrentUser, settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    r = await sync_tenant(settings, tenant)
    return {"seen": r.seen, "ignored": r.ignored, "filed": r.filed, "auto_sent": r.auto_sent,
            "to_validate": r.to_validate, "errors": r.errors}


@router.get("/oauth/google/callback")
async def google_callback(
    settings: Settings = Depends(get_settings),
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
) -> RedirectResponse:
    def back(status: str, message: str = "") -> RedirectResponse:
        query = urlencode({"gmail": status, **({"message": message} if message else {})})
        return RedirectResponse(f"{settings.crm_public_url.rstrip('/')}/reglages?{query}",
                                status_code=303)

    if error:
        return back("annule", "Connexion annulée sur la page Google.")
    try:
        claims = read_state(settings, state)
        tokens = await exchange_code(settings, code)
        if not tokens.refresh_token:
            raise GoogleAuthError("Google n'a pas fourni d'accès durable, recommencez")
        if "gmail.modify" not in tokens.scope:
            raise GoogleAuthError("l'accès à Gmail n'a pas été coché sur la page Google")
        with session_scope(settings.database_url) as session:
            user = session.get(User, claims["uid"])
            if user is None or user.tenant_id != claims["tid"] or user.role != "admin":
                raise GoogleAuthError("compte non autorisé")
            account = session.scalar(select(MailAccount).where(MailAccount.tenant_id == user.tenant_id))
            if account is None:
                account = MailAccount(tenant_id=user.tenant_id)
                session.add(account)
            account.email = (tokens.email or "").lower()
            account.refresh_token_enc = encrypt(settings, tokens.refresh_token)
            account.scopes = tokens.scope
            account.connected_by = user.email
            account.connected_at = datetime.now(UTC)
            account.active, account.last_error, account.label_id = True, None, None
        _ACCESS.pop(claims["tid"], None)
    except (GoogleAuthError, MailCryptoError) as exc:
        return back("erreur", str(exc))
    return back("ok")
