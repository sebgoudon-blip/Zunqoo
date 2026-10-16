"""Stockage des tenants.

L'implémentation fichier (un JSON par commerçant) suffit pour le one-shot et
les premiers clients SaaS. Pour passer sur Postgres/Firestore, il suffit
d'implémenter ``TenantStore`` — le reste du code ne dépend que du protocole.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from .models import TenantConfig

_SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")


def normalize_number(number: str) -> str:
    """Normalise un numéro en E.164 (+33…). Gère 06…, 0033…, 33…, sip:+33…@."""
    n = number.strip()
    n = re.sub(r"^sips?:", "", n).split("@", 1)[0]
    digits = re.sub(r"[^\d+]", "", n)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    elif digits.startswith("0") and len(digits) == 10:  # numéro français national
        digits = "+33" + digits[1:]
    elif not digits.startswith("+"):
        digits = "+" + digits
    return digits


class TenantStore(Protocol):
    def get(self, tenant_id: str) -> TenantConfig | None: ...
    def find_by_number(self, dialed_number: str) -> TenantConfig | None: ...
    def save(self, tenant: TenantConfig) -> None: ...
    def list(self) -> list[TenantConfig]: ...


class FileTenantStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, tenant_id: str) -> Path:
        if not _SAFE_ID.match(tenant_id):
            raise ValueError(f"identifiant tenant invalide: {tenant_id!r}")
        return self.directory / f"{tenant_id}.json"

    def get(self, tenant_id: str) -> TenantConfig | None:
        path = self._path(tenant_id)
        if not path.exists():
            return None
        return TenantConfig.model_validate_json(path.read_text("utf-8"))

    def list(self) -> list[TenantConfig]:
        return [
            TenantConfig.model_validate_json(p.read_text("utf-8"))
            for p in sorted(self.directory.glob("*.json"))
        ]

    def find_by_number(self, dialed_number: str) -> TenantConfig | None:
        wanted = normalize_number(dialed_number)
        for tenant in self.list():
            if any(normalize_number(n) == wanted for n in tenant.phone_numbers):
                return tenant
        return None

    def save(self, tenant: TenantConfig) -> None:
        tenant.updated_at = datetime.now(UTC)
        data = tenant.model_dump(mode="json")
        # Les secrets ne sont jamais réécrits en clair par le dump pydantic :
        # on réinjecte la valeur réelle si elle existe.
        if tenant.whatsapp.access_token is not None:
            data["whatsapp"]["access_token"] = tenant.whatsapp.access_token.get_secret_value()
        tmp = self._path(tenant.id).with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(self._path(tenant.id))
