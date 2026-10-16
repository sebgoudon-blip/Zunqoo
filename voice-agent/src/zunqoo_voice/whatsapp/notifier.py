"""Envoi du compte-rendu d'appel au(x) gérant(s) du tenant."""

from __future__ import annotations

import logging

from ..core.config import Settings
from ..core.models import CallRecord, TenantConfig
from .client import REENGAGEMENT_REQUIRED, WhatsAppClient, WhatsAppCredentials, WhatsAppError
from .formatter import format_report_text, template_parameters

log = logging.getLogger(__name__)


def credentials_for(tenant: TenantConfig, settings: Settings) -> WhatsAppCredentials:
    """Le tenant peut apporter son propre compte WhatsApp Business (marque
    blanche) ; sinon on envoie depuis le numéro de la plateforme."""
    wa = tenant.whatsapp
    token = wa.access_token.get_secret_value() if wa.access_token else ""
    return WhatsAppCredentials(
        phone_number_id=wa.phone_number_id or settings.whatsapp_phone_number_id,
        access_token=token or settings.whatsapp_access_token.get_secret_value(),
        api_version=settings.whatsapp_api_version,
    )


async def send_call_report(
    tenant: TenantConfig,
    record: CallRecord,
    settings: Settings,
    *,
    client: WhatsAppClient | None = None,
) -> dict[str, str]:
    """Envoie le compte-rendu à chaque numéro gérant.

    Stratégie : template approuvé d'abord (fonctionne toujours, même si le
    gérant n'a pas écrit depuis 24 h), puis repli sur un message texte si le
    template n'est pas encore validé par Meta. Retourne {numéro: message_id}.
    """
    recipients = tenant.whatsapp.manager_numbers
    if not recipients:
        log.warning("tenant %s: aucun numéro WhatsApp gérant configuré", tenant.id)
        return {}

    template = tenant.whatsapp.template_name or settings.whatsapp_template_name
    lang = tenant.whatsapp.template_lang or settings.whatsapp_template_lang
    text = format_report_text(record)
    params = template_parameters(record)

    owns_client = client is None
    client = client or WhatsAppClient(credentials_for(tenant, settings))
    sent: dict[str, str] = {}
    try:
        for to in recipients:
            try:
                if template:
                    try:
                        sent[to] = await client.send_template(to, template, lang, params)
                        continue
                    except WhatsAppError as exc:
                        log.warning("template %s refusé (%s), repli texte", template, exc)
                sent[to] = await client.send_text(to, text)
            except WhatsAppError as exc:
                if exc.code == REENGAGEMENT_REQUIRED:
                    log.error(
                        "tenant %s: %s hors fenêtre 24 h et template indisponible — "
                        "faire approuver le template '%s'",
                        tenant.id, to, template,
                    )
                else:
                    log.error("tenant %s: envoi WhatsApp à %s impossible: %s", tenant.id, to, exc)
    finally:
        if owns_client:
            await client.aclose()
    return sent
