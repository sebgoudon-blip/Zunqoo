"""Accès à la boîte e-mail connectée d'un commerce."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..crm.db import MailAccount
from .crypto import decrypt, encrypt
from .google_oauth import refresh_access_token

# Jetons d'accès en mémoire (valables ~1 h) : {tenant_id: (jeton, expiration)}
_ACCESS: dict[str, tuple[str, datetime]] = {}


async def access_token(settings: Settings, account: MailAccount) -> str:
    cached = _ACCESS.get(account.tenant_id)
    if cached and cached[1] > datetime.now(UTC):
        return cached[0]
    tokens = await refresh_access_token(settings, decrypt(settings, account.refresh_token_enc))
    if tokens.refresh_token:  # Google peut faire tourner le refresh token
        account.refresh_token_enc = encrypt(settings, tokens.refresh_token)
    _ACCESS[account.tenant_id] = (tokens.access_token, tokens.expires_at)
    return tokens.access_token


def get_account(session: Session, tenant_id: str) -> MailAccount | None:
    return session.scalar(select(MailAccount).where(MailAccount.tenant_id == tenant_id,
                                                    MailAccount.active.is_(True)))
