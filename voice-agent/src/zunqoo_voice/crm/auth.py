"""Comptes du CRM : mots de passe (scrypt) et jetons de session (JWT HS256)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    if len(password) < 10:
        raise ValueError("le mot de passe doit faire au moins 10 caractères")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = base64.b64encode
    return f"scrypt${_N}${_R}${_P}${b64(salt).decode()}${b64(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = stored.split("$")
    except ValueError:
        return False
    if algo != "scrypt":
        return False
    digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64),
                            n=int(n), r=int(r), p=int(p), dklen=32)
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


def issue_token(user_id: str, tenant_id: str, secret: str, hours: int) -> str:
    if len(secret) < 32:
        raise RuntimeError("SESSION_SECRET manquant ou trop court (openssl rand -hex 32)")
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": user_id, "tid": tenant_id, "iat": now, "exp": now + timedelta(hours=hours)},
        secret, algorithm="HS256",
    )


def read_token(token: str, secret: str) -> dict:
    return jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
