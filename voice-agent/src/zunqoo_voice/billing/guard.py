"""Point de contrôle unique « ce tenant a-t-il le droit de prendre l'appel ? »."""

from __future__ import annotations

import logging
from datetime import datetime
from functools import lru_cache

from ..core.config import Settings
from ..core.models import TenantConfig
from .license import License, LicenseError, license_allows_tenant, verify_license
from .usage import UsageMeter

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_license(path: str, public_key: str) -> License:
    with open(path, encoding="utf-8") as fh:
        return verify_license(fh.read(), public_key)


def check_call_allowed(
    tenant: TenantConfig, settings: Settings, meter: UsageMeter, now: datetime
) -> tuple[bool, str]:
    if not tenant.active:
        return False, "tenant désactivé"

    if settings.deployment_mode == "onprem":
        if not settings.license_file or not settings.license_public_key:
            return False, "licence manquante (LICENSE_FILE / LICENSE_PUBLIC_KEY)"
        try:
            lic = _load_license(str(settings.license_file), settings.license_public_key)
        except (LicenseError, OSError) as exc:
            return False, str(exc)
        if not license_allows_tenant(lic, tenant.id):
            return False, "tenant non couvert par la licence"
        return True, "ok"

    remaining = meter.quota_remaining(tenant, now)
    if remaining is not None and remaining <= 0:
        # On ne raccroche pas au nez d'un client du commerçant : on décroche
        # et on facture le dépassement. Le log alimente l'alerte commerciale.
        log.warning("tenant %s: forfait dépassé (%d min), dépassement facturé", tenant.id,
                    -remaining)
    return True, "ok"
