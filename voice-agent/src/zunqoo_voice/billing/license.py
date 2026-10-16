"""Licences signées pour le modèle One-Shot (installation chez le client).

Une licence est un petit JSON signé en Ed25519 par l'éditeur. L'instance
installée ne contient que la clé publique : elle vérifie la licence
hors-ligne au démarrage, sans dépendre d'un serveur de l'éditeur.

Format : ``base64url(payload_json) + "." + base64url(signature)``.
"""

from __future__ import annotations

import base64
import json
from datetime import date

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from pydantic import BaseModel, Field

from ..core.models import Plan


class LicenseError(RuntimeError):
    pass


class License(BaseModel):
    license_id: str
    customer: str
    plan: Plan = Plan.ONE_SHOT
    tenant_ids: list[str] = Field(default_factory=list, description="vide = tous")
    max_tenants: int = 1
    issued_at: date
    # Date de fin des mises à jour/du support ; le logiciel continue de tourner après.
    updates_until: date | None = None
    # Date d'arrêt dure (licence de location / essai). None = perpétuelle.
    expires_at: date | None = None


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def generate_keypair() -> tuple[str, str]:
    """(clé privée, clé publique) en base64 brut — à faire une seule fois."""
    priv = Ed25519PrivateKey.generate()
    priv_raw = priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    pub_raw = priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return _b64e(priv_raw), _b64e(pub_raw)


def sign_license(lic: License, private_key_b64: str) -> str:
    priv = Ed25519PrivateKey.from_private_bytes(_b64d(private_key_b64))
    payload = json.dumps(lic.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return f"{_b64e(payload.encode())}.{_b64e(priv.sign(payload.encode()))}"


def verify_license(token: str, public_key_b64: str, *, today: date | None = None) -> License:
    try:
        payload_b64, sig_b64 = token.strip().split(".", 1)
        payload = _b64d(payload_b64)
        Ed25519PublicKey.from_public_bytes(_b64d(public_key_b64)).verify(_b64d(sig_b64), payload)
    except (ValueError, InvalidSignature) as exc:
        raise LicenseError("licence invalide ou altérée") from exc
    lic = License.model_validate_json(payload)
    if lic.expires_at and (today or date.today()) > lic.expires_at:
        raise LicenseError(f"licence expirée le {lic.expires_at.isoformat()}")
    return lic


def license_allows_tenant(lic: License, tenant_id: str) -> bool:
    return not lic.tenant_ids or tenant_id in lic.tenant_ids
