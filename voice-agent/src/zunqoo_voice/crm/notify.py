"""Création d'une validation + alerte WhatsApp au gérant."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from .db import Approval, Contact
from .modules import ModuleKey
from .services import create_approval

log = logging.getLogger(__name__)


async def request_approval(
    session: Session,
    settings: Settings,
    tenant: TenantConfig,
    *,
    module: ModuleKey,
    kind: str,
    title: str,
    summary: str,
    payload: dict,
    contact: Contact | None = None,
) -> Approval:
    approval = create_approval(session, tenant_id=tenant.id, module=module, kind=kind,
                               title=title, summary=summary, payload=payload, contact=contact)
    # Import local : évite un cycle crm <-> whatsapp au chargement.
    from ..whatsapp.approvals import send_approval_request

    try:
        await send_approval_request(tenant, approval, settings)
    except Exception:
        log.exception("alerte WhatsApp de la validation %s non envoyée", approval.id)
    return approval
