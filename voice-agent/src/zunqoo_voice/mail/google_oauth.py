"""Connexion d'une boîte Gmail via Google OAuth 2.0 (flux « serveur web »).

1. Le CRM demande une URL d'autorisation (``authorization_url``) : le
   ``state`` est un jeton signé qui contient le commerce et l'utilisateur,
   valable 10 minutes.
2. Google renvoie le navigateur sur ``/oauth/google/callback`` avec un code.
3. On échange le code contre un *refresh token*, stocké chiffré.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt

from ..core.config import Settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"

# gmail.modify : lire, classer (libellés) et envoyer ; pas de suppression définitive.
SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.modify",
]


class GoogleAuthError(RuntimeError):
    pass


def redirect_uri(settings: Settings) -> str:
    return f"{settings.api_public_url.rstrip('/')}/oauth/google/callback"


def _check_config(settings: Settings) -> None:
    if not settings.google_client_id or not settings.google_client_secret.get_secret_value():
        raise GoogleAuthError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés")


def authorization_url(settings: Settings, *, tenant_id: str, user_id: str,
                      login_hint: str | None = None) -> str:
    _check_config(settings)
    state = jwt.encode(
        {"tid": tenant_id, "uid": user_id, "nonce": secrets.token_urlsafe(16),
         "exp": datetime.now(UTC) + timedelta(minutes=10), "purpose": "gmail"},
        settings.session_secret.get_secret_value(), algorithm="HS256",
    )
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri(settings),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # pour obtenir un refresh token
        "prompt": "consent",        # Google ne renvoie le refresh token qu'avec un consentement
        "include_granted_scopes": "true",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(params)}"


def read_state(settings: Settings, state: str) -> dict:
    try:
        claims = jwt.decode(state, settings.session_secret.get_secret_value(),
                            algorithms=["HS256"], options={"require": ["exp", "tid", "uid"]})
    except jwt.PyJWTError as exc:
        raise GoogleAuthError("lien de connexion expiré ou invalide, recommencez") from exc
    if claims.get("purpose") != "gmail":
        raise GoogleAuthError("lien de connexion invalide")
    return claims


@dataclass
class TokenSet:
    access_token: str
    expires_at: datetime
    refresh_token: str | None
    scope: str
    email: str | None


async def exchange_code(settings: Settings, code: str,
                        http: httpx.AsyncClient | None = None) -> TokenSet:
    _check_config(settings)
    data = await _token_request(settings, http, {
        "code": code,
        "redirect_uri": redirect_uri(settings),
        "grant_type": "authorization_code",
    })
    email = None
    if data.get("id_token"):
        # Le jeton vient directement de Google en HTTPS : on lit l'adresse sans
        # revérifier la signature (aucune décision de sécurité ne repose dessus).
        email = jwt.decode(data["id_token"], options={"verify_signature": False}).get("email")
    return TokenSet(
        access_token=data["access_token"],
        expires_at=datetime.now(UTC) + timedelta(seconds=int(data.get("expires_in", 3600)) - 60),
        refresh_token=data.get("refresh_token"),
        scope=data.get("scope", ""),
        email=email,
    )


async def refresh_access_token(settings: Settings, refresh_token: str,
                               http: httpx.AsyncClient | None = None) -> TokenSet:
    data = await _token_request(settings, http, {
        "refresh_token": refresh_token, "grant_type": "refresh_token",
    })
    return TokenSet(
        access_token=data["access_token"],
        expires_at=datetime.now(UTC) + timedelta(seconds=int(data.get("expires_in", 3600)) - 60),
        refresh_token=data.get("refresh_token"),
        scope=data.get("scope", ""),
        email=None,
    )


async def revoke(refresh_token: str, http: httpx.AsyncClient | None = None) -> None:
    client = http or httpx.AsyncClient(timeout=15)
    try:
        await client.post(REVOKE_URL, data={"token": refresh_token})
    finally:
        if http is None:
            await client.aclose()


async def _token_request(settings: Settings, http: httpx.AsyncClient | None, form: dict) -> dict:
    client = http or httpx.AsyncClient(timeout=15)
    try:
        resp = await client.post(TOKEN_URL, data={
            **form,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret.get_secret_value(),
        })
    except httpx.HTTPError as exc:
        raise GoogleAuthError(f"Google injoignable : {exc}") from exc
    finally:
        if http is None:
            await client.aclose()
    if resp.status_code != 200:
        try:
            err = resp.json()
        except ValueError:
            err = {}
        if err.get("error") == "invalid_grant":
            raise GoogleAuthError("accès Gmail révoqué ou expiré : reconnectez la boîte")
        raise GoogleAuthError(f"Google a refusé la demande ({err.get('error', resp.status_code)})")
    return resp.json()
