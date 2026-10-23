"""Webhook WhatsApp (Meta) : réception des clics « Valider / Refuser ».

Sécurité : chaque requête est signée par Meta (``X-Hub-Signature-256``,
HMAC-SHA256 du corps avec le secret de l'application) et seul un numéro
gérant du commerce concerné peut décider.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from ..core.config import Settings, get_settings
from ..core.tenant_store import FileTenantStore, normalize_number
from ..whatsapp.approvals import parse_button_payload
from ..whatsapp.client import WhatsAppClient, WhatsAppError
from ..whatsapp.notifier import credentials_for
from .approvals import ApprovalError, decide
from .db import Approval, session_scope

log = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks")


@router.get("/whatsapp", response_class=PlainTextResponse)
def verify(
    settings: Settings = Depends(get_settings),
    mode: str = Query(alias="hub.mode", default=""),
    token: str = Query(alias="hub.verify_token", default=""),
    challenge: str = Query(alias="hub.challenge", default=""),
) -> str:
    expected = settings.whatsapp_verify_token.get_secret_value()
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return challenge
    raise HTTPException(status_code=403, detail="jeton de vérification invalide")


def check_signature(body: bytes, header: str, secret: str) -> bool:
    if not secret or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.removeprefix("sha256="), expected)


def extract_button_clicks(event: dict) -> list[tuple[str, str]]:
    """[(numéro expéditeur, payload)] pour les clics sur un bouton."""
    clicks = []
    for entry in event.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                if msg.get("type") == "button":  # bouton de template
                    clicks.append((msg["from"], msg["button"]["payload"]))
                elif msg.get("type") == "interactive":
                    reply = msg["interactive"].get("button_reply") or {}
                    if reply.get("id"):
                        clicks.append((msg["from"], reply["id"]))
    return clicks


@router.post("/whatsapp")
async def receive(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    body = await request.body()
    if not check_signature(body, request.headers.get("x-hub-signature-256", ""),
                           settings.whatsapp_app_secret.get_secret_value()):
        raise HTTPException(status_code=401, detail="signature invalide")
    store = FileTenantStore(settings.tenants_dir)

    for sender, payload in extract_button_clicks(json.loads(body)):
        parsed = parse_button_payload(payload)
        if parsed is None:
            continue
        approve, approval_id = parsed
        with session_scope(settings.database_url) as session:
            approval = session.get(Approval, approval_id)
            tenant = store.get(approval.tenant_id) if approval else None
            managers = {normalize_number(n) for n in (tenant.whatsapp.manager_numbers if tenant
                                                      else [])}
            if tenant is None or normalize_number(sender) not in managers:
                log.warning("clic de validation refusé (expéditeur %s non autorisé)", sender)
                continue
            try:
                done = await decide(session, settings, tenant_id=tenant.id,
                                    approval_id=approval_id, approve=approve,
                                    decided_by=f"whatsapp:{sender}", channel="whatsapp")
                reply = {
                    "refuse": f"❌ Refusé : {done.title}",
                    "execute": f"✅ Fait : {done.title}",
                    "approuve": f"✅ Validé : {done.title}",
                    "echec": f"⚠️ Validé mais l'envoi a échoué : {done.title}. "
                             "Voir le CRM pour réessayer.",
                }[done.status]
            except ApprovalError as exc:
                reply = f"ℹ️ Rien à faire : {exc}."
        # Accusé au gérant (le clic ouvre la fenêtre de 24 h : texte libre autorisé).
        client = WhatsAppClient(credentials_for(tenant, settings))
        try:
            await client.send_text(sender, reply)
        except WhatsAppError as exc:
            log.warning("accusé de validation non envoyé: %s", exc)
        finally:
            await client.aclose()
    return {"ok": True}
