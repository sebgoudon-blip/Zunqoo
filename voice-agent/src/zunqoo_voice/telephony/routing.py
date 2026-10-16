"""Résolution du tenant et de l'appelant à partir d'un appel SIP entrant.

LiveKit SIP expose les infos d'appel en attributs du participant :
``sip.phoneNumber`` (appelant), ``sip.trunkPhoneNumber`` (numéro composé),
``sip.callID``. La règle de dispatch peut aussi passer ``tenant_id`` dans
les métadonnées du job (voir ``provision.py``).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from livekit import rtc

from ..core.models import TenantConfig
from ..core.tenant_store import TenantStore, normalize_number


@dataclass
class CallerInfo:
    identity: str
    caller_number: str | None
    dialed_number: str | None
    sip_call_id: str | None
    is_sip: bool


def caller_info(participant: rtc.RemoteParticipant) -> CallerInfo:
    attrs = participant.attributes or {}
    caller = attrs.get("sip.phoneNumber")
    dialed = attrs.get("sip.trunkPhoneNumber")
    return CallerInfo(
        identity=participant.identity,
        caller_number=normalize_number(caller) if caller else None,
        dialed_number=normalize_number(dialed) if dialed else None,
        sip_call_id=attrs.get("sip.callID"),
        is_sip=participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP,
    )


def tenant_id_from_metadata(job_metadata: str | None) -> str | None:
    if not job_metadata:
        return None
    try:
        return json.loads(job_metadata).get("tenant_id")
    except (json.JSONDecodeError, AttributeError):
        return None


def resolve_tenant(
    store: TenantStore,
    *,
    job_metadata: str | None,
    dialed_number: str | None,
    default_tenant_id: str | None,
) -> TenantConfig | None:
    """Ordre : métadonnées de dispatch > numéro composé > tenant par défaut."""
    if (tid := tenant_id_from_metadata(job_metadata)) and (tenant := store.get(tid)):
        return tenant
    if dialed_number and (tenant := store.find_by_number(dialed_number)):
        return tenant
    if default_tenant_id:
        return store.get(default_tenant_id)
    return None
