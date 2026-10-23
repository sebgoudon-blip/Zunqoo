"""Chiffrement des jetons d'accès e-mail stockés en base (Fernet / AES)."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from ..core.config import Settings


class MailCryptoError(RuntimeError):
    pass


def generate_key() -> str:
    return Fernet.generate_key().decode()


def _fernet(settings: Settings) -> Fernet:
    key = settings.mail_token_key.get_secret_value()
    if not key:
        raise MailCryptoError("MAIL_TOKEN_KEY manquant (zunqoo-mail genkey)")
    try:
        return Fernet(key.encode())
    except ValueError as exc:
        raise MailCryptoError("MAIL_TOKEN_KEY invalide") from exc


def encrypt(settings: Settings, value: str) -> str:
    return _fernet(settings).encrypt(value.encode()).decode()


def decrypt(settings: Settings, value: str) -> str:
    try:
        return _fernet(settings).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise MailCryptoError("jeton illisible : la clé MAIL_TOKEN_KEY a changé ?") from exc
