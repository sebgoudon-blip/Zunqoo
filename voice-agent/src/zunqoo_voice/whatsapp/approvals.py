"""Validation par WhatsApp : envoi de la demande et lecture de la réponse.

Le gérant reçoit l'élément à valider avec deux boutons. Sa réponse revient
par le webhook Meta (``crm/webhook.py``) sous forme de payload
``ok:<id>`` ou ``non:<id>``. Le lien « voir / modifier » ouvre le CRM.

Template à faire approuver (catégorie UTILITY, langue fr), nommé
``zunqoo_validation`` :

    ✅ À valider : {{1}}
    {{2}}
    Détail et modification : {{3}}

avec deux boutons « réponse rapide » : « Valider » puis « Refuser ».
"""

from __future__ import annotations

import logging

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.db import Approval
from .client import WhatsAppClient, WhatsAppError
from .formatter import _flat
from .notifier import credentials_for

log = logging.getLogger(__name__)

APPROVE, REJECT = "ok", "non"


def parse_button_payload(payload: str) -> tuple[bool, str] | None:
    action, _, approval_id = payload.partition(":")
    if action not in (APPROVE, REJECT) or not approval_id.isalnum():
        return None
    return action == APPROVE, approval_id


def approval_link(settings: Settings, approval: Approval) -> str:
    return f"{settings.crm_public_url.rstrip('/')}/a-valider?id={approval.id}"


async def send_approval_request(
    tenant: TenantConfig,
    approval: Approval,
    settings: Settings,
    *,
    client: WhatsAppClient | None = None,
) -> dict[str, str]:
    recipients = tenant.whatsapp.manager_numbers
    if not recipients:
        return {}
    link = approval_link(settings, approval)
    buttons = [f"{APPROVE}:{approval.id}", f"{REJECT}:{approval.id}"]
    owns = client is None
    client = client or WhatsAppClient(credentials_for(tenant, settings))
    sent: dict[str, str] = {}
    try:
        for to in recipients:
            try:
                sent[to] = await client.send_template_with_buttons(
                    to, settings.whatsapp_approval_template,
                    tenant.whatsapp.template_lang or settings.whatsapp_template_lang,
                    [_flat(approval.title, limit=200), _flat(approval.summary), link],
                    buttons,
                )
                continue
            except WhatsAppError as exc:
                log.warning("template de validation indisponible (%s), repli interactif", exc)
            try:
                sent[to] = await client.send_buttons(
                    to,
                    f"✅ *À valider : {approval.title}*\n{approval.summary}\n\n"
                    f"Détail et modification : {link}",
                    [(buttons[0], "Valider"), (buttons[1], "Refuser")],
                )
            except WhatsAppError as exc:
                log.error("demande de validation %s non envoyée à %s: %s", approval.id, to, exc)
    finally:
        if owns:
            await client.aclose()
    return sent
