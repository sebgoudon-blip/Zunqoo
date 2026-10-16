"""Provisionnement LiveKit SIP d'un tenant : trunk entrant + règle de dispatch.

    zunqoo-sip rotisserie-dupont

Crée un trunk entrant portant les SDA du tenant, puis une règle de dispatch
qui place chaque appel dans sa propre room et y envoie l'agent nommé
``LIVEKIT_AGENT_NAME`` avec ``{"tenant_id": ...}`` en métadonnées.

Côté opérateur (Twilio Elastic SIP Trunking, OVH, Telnyx…), il reste à faire
pointer l'origination du numéro vers l'URI SIP de votre projet LiveKit
(voir README).
"""

from __future__ import annotations

import argparse
import asyncio
import json

from livekit import api

from ..core.config import Settings, get_settings
from ..core.models import TenantConfig
from ..core.tenant_store import FileTenantStore


async def provision_tenant(tenant: TenantConfig, settings: Settings) -> tuple[str, str]:
    if not tenant.phone_numbers:
        raise ValueError(f"tenant {tenant.id}: aucun numéro (phone_numbers) à router")
    lk = api.LiveKitAPI(
        url=settings.livekit_url.replace("wss://", "https://").replace("ws://", "http://"),
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret.get_secret_value(),
    )
    try:
        trunk = await lk.sip.create_sip_inbound_trunk(
            api.CreateSIPInboundTrunkRequest(
                trunk=api.SIPInboundTrunkInfo(
                    name=f"zunqoo-{tenant.id}",
                    numbers=tenant.phone_numbers,
                    krisp_enabled=True,  # réduction de bruit (marché, cuisine)
                    metadata=json.dumps({"tenant_id": tenant.id}),
                )
            )
        )
        rule = await lk.sip.create_sip_dispatch_rule(
            api.CreateSIPDispatchRuleRequest(
                name=f"zunqoo-{tenant.id}",
                trunk_ids=[trunk.sip_trunk_id],
                rule=api.SIPDispatchRule(
                    dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                        room_prefix=f"call-{tenant.id}-"
                    )
                ),
                room_config=api.RoomConfiguration(
                    agents=[
                        api.RoomAgentDispatch(
                            agent_name=settings.livekit_agent_name,
                            metadata=json.dumps({"tenant_id": tenant.id}),
                        )
                    ]
                ),
            )
        )
    finally:
        await lk.aclose()
    return trunk.sip_trunk_id, rule.sip_dispatch_rule_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Provisionne LiveKit SIP pour un tenant")
    parser.add_argument("tenant_id")
    args = parser.parse_args()
    settings = get_settings()
    tenant = FileTenantStore(settings.tenants_dir).get(args.tenant_id)
    if tenant is None:
        raise SystemExit(f"tenant inconnu: {args.tenant_id}")
    trunk_id, rule_id = asyncio.run(provision_tenant(tenant, settings))
    print(f"trunk={trunk_id} dispatch_rule={rule_id}")


if __name__ == "__main__":
    main()
