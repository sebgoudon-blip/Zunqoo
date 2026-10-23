"""Orchestration principale : appel SIP -> Deepgram -> LLM -> ElevenLabs.

Lancement :

    python -m zunqoo_voice.agent.worker download-files   # une fois (VAD, turn detector)
    python -m zunqoo_voice.agent.worker dev               # développement
    python -m zunqoo_voice.agent.worker start             # production
    python -m zunqoo_voice.agent.worker console           # test au micro, sans téléphone

Pipeline par appel :

  téléphone ─SIP─▶ LiveKit room ─audio─▶ Silero VAD ─┬─▶ Deepgram (stream FR)
                                                    │        │ transcriptions partielles
                                                    │        ▼
                                                    │   détecteur de fin de tour
                                                    │        ▼
                                                    │   LLM (+ outils) ─ tokens en flux
                                                    │        ▼
                                                    └── ElevenLabs WebSocket ─▶ audio ─▶ appelant
                     barge-in : la VAD détecte la voix de l'appelant pendant que l'agent
                     parle -> lecture TTS coupée + génération LLM annulée immédiatement.

En fin d'appel (raccroché par l'un ou l'autre), le callback de shutdown
analyse la transcription et envoie le compte-rendu WhatsApp au gérant.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    ChatMessage,
    JobContext,
    JobProcess,
    cli,
    inference,
    room_io,
)
from livekit.plugins import silero

from ..billing.guard import check_call_allowed
from ..billing.plans import entitlements_for
from ..billing.usage import UsageMeter
from ..core.call_archive import CallArchive
from ..core.config import Settings, get_settings
from ..core.models import CallRecord, TenantConfig
from ..core.structured_llm import StructuredLLM
from ..core.tenant_store import FileTenantStore
from ..crm.db import session_scope
from ..crm.modules import ModuleKey
from ..crm.services import catalog_as_products, enabled_modules, list_catalog, record_call
from ..llm.call_analysis import analyze_call
from ..llm.factory import build_chat_llm
from ..llm.prompts import build_greeting, build_system_prompt
from ..llm.tools import ALL_TOOLS, CallState, enregistrer_commande, transferer_appel
from ..stt.factory import build_stt
from ..telephony.routing import caller_info, resolve_tenant
from ..tts.factory import build_tts
from ..whatsapp.notifier import send_call_report

log = logging.getLogger("zunqoo.agent")


class ShopAgent(Agent):
    """L'agent d'accueil téléphonique d'un commerce."""

    def __init__(
        self, tenant: TenantConfig, *, instructions: str, orders_enabled: bool = True
    ) -> None:
        tools = list(ALL_TOOLS)
        if not (tenant.transfer_number and entitlements_for(tenant.plan).call_transfer):
            tools.remove(transferer_appel)
        if not orders_enabled:  # module « Prise de commandes » non coché
            tools.remove(enregistrer_commande)
        super().__init__(instructions=instructions, tools=tools)
        self.tenant = tenant


def prewarm(proc: JobProcess) -> None:
    """Chargé une fois par processus : évite ~300 ms de latence au décroché."""
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.35,  # réactif, le détecteur de fin de tour arbitre
        activation_threshold=0.5,
    )


server = AgentServer(setup_fnc=prewarm)


def build_transcript(session: AgentSession) -> str:
    lines = []
    for item in session.history.items:
        if isinstance(item, ChatMessage) and item.role in ("user", "assistant"):
            text = (item.text_content or "").strip()
            if text:
                speaker = "Client" if item.role == "user" else "Agent"
                lines.append(f"{speaker} : {text}")
    return "\n".join(lines)


async def finalize_call(
    session: AgentSession[CallState], settings: Settings, meter: UsageMeter, reason: str
) -> None:
    """Fin d'appel : analyse, compte-rendu WhatsApp, comptage des minutes."""
    state = session.userdata
    ended_at = datetime.now(UTC)
    transcript = build_transcript(session)
    duration = (ended_at - state.started_at).total_seconds()
    log.info("appel %s terminé (%s), %.0f s", state.call_id, reason, duration)

    record = CallRecord(
        tenant_id=state.tenant.id, call_id=state.call_id, caller_number=state.caller_number,
        started_at=state.started_at, ended_at=ended_at, duration_s=duration,
        transcript=transcript,
    )
    meter.record_call(state.tenant.id, state.call_id, state.started_at, duration)
    archive = CallArchive(settings.calls_dir)

    # Appel décroché puis raccroché sans un mot : rien à signaler.
    if not any(line.startswith("Client") for line in transcript.splitlines()):
        log.info("appel %s sans parole du client, pas de compte-rendu", state.call_id)
        return

    try:
        record.report = await analyze_call(
            transcript, state.tenant, llm=StructuredLLM(settings),
            call_time=state.started_at.astimezone(ZoneInfo(state.tenant.timezone)),
            caller_number=state.caller_number, confirmed_order=state.confirmed_order,
        )
        meter.record_call(state.tenant.id, state.call_id, state.started_at, duration,
                          record.report.intent.value)
    except Exception:
        log.exception("analyse post-appel échouée pour %s", state.call_id)

    # Archivé AVANT l'envoi WhatsApp : si Meta est en panne, la commande
    # n'est jamais perdue (relevable dans data/calls/ ou via l'API admin).
    archive.save(record)
    try:
        with session_scope(settings.database_url) as db:
            record_call(db, record)  # fiche client + historique dans le CRM
    except Exception:
        log.exception("enregistrement CRM de l'appel %s échoué", state.call_id)
    if entitlements_for(state.tenant.plan).whatsapp_reports:
        sent = await send_call_report(state.tenant, record, settings)
        archive.mark_notified(record, sent)


@server.rtc_session(agent_name=get_settings().livekit_agent_name)
async def entrypoint(ctx: JobContext) -> None:
    settings = get_settings()
    store = FileTenantStore(settings.tenants_dir)
    meter = UsageMeter(settings.usage_db_path)

    await ctx.connect()
    participant = await ctx.wait_for_participant()
    info = caller_info(participant)

    tenant = resolve_tenant(
        store, job_metadata=ctx.job.metadata, dialed_number=info.dialed_number,
        default_tenant_id=settings.default_tenant_id,
    )
    if tenant is None:
        log.error("aucun tenant pour le numéro %s, appel rejeté", info.dialed_number)
        await ctx.delete_room()
        return

    now_local = datetime.now(ZoneInfo(tenant.timezone))
    allowed, why = check_call_allowed(tenant, settings, meter, now_local)
    if not allowed:
        log.error("tenant %s: appel refusé (%s)", tenant.id, why)
        await ctx.delete_room()
        return

    # Réglages du CRM : modules cochés par le client et catalogue à jour.
    with session_scope(settings.database_url) as db:
        modules = enabled_modules(db, tenant.id)
        catalog = list_catalog(db, tenant.id, only_active=True)
    if ModuleKey.PHONE not in modules:
        # Standard désactivé : l'appel ne doit pas rester sans réponse.
        if tenant.transfer_number:
            log.info("tenant %s: standard désactivé, renvoi vers %s", tenant.id,
                     tenant.transfer_number)
            await ctx.transfer_sip_participant(info.identity, f"tel:{tenant.transfer_number}")
        else:
            log.warning("tenant %s: standard désactivé et aucun renvoi configuré", tenant.id)
            await ctx.delete_room()
        return
    if catalog:
        tenant = tenant.model_copy(deep=True)
        tenant.profile.products = catalog_as_products(catalog)
    orders_enabled = ModuleKey.ORDERS in modules

    state = CallState(
        tenant=tenant, call_id=info.sip_call_id or ctx.room.name,
        caller_number=info.caller_number, caller_identity=info.identity,
        started_at=datetime.now(UTC),
    )

    session = AgentSession[CallState](
        vad=ctx.proc.userdata["vad"],
        stt=build_stt(settings, tenant),
        llm=build_chat_llm(settings),
        tts=build_tts(settings, tenant),
        userdata=state,
        max_tool_steps=4,
        user_away_timeout=20,
        turn_handling={
            "turn_detection": (
                inference.TurnDetector(local_fallback=True)
                if settings.turn_detector == "model" else "vad"
            ),
            # Délai de silence avant de répondre : court quand la phrase est
            # clairement finie, plus long si le client hésite ("euh… et puis…").
            "endpointing": {"min_delay": 0.35, "max_delay": 2.5},
            # Barge-in : la VAD coupe le TTS et annule la génération en cours dès
            # 0,3 s de parole. Un bruit bref (toux, "hm") n'est pas une vraie
            # interruption : la phrase reprend après 1 s de silence.
            "interruption": {
                "enabled": True,
                "mode": "vad",
                "min_duration": 0.3,
                "resume_false_interruption": True,
                "false_interruption_timeout": 1.0,
            },
            # Le LLM commence à générer sur la transcription partielle, avant
            # même la fin de tour confirmée : on gagne 200 à 500 ms par réponse.
            "preemptive_generation": {"enabled": True},
        },
    )

    async def _on_shutdown(reason: str) -> None:
        await finalize_call(session, settings, meter, reason)

    ctx.add_shutdown_callback(_on_shutdown)

    agent = ShopAgent(
        tenant,
        instructions=build_system_prompt(tenant, now=now_local, caller_number=info.caller_number,
                                         orders_enabled=orders_enabled),
        orders_enabled=orders_enabled,
    )
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            participant_identity=info.identity,
            close_on_disconnect=True,   # le client raccroche -> fin de session
            delete_room_on_close=True,
        ),
    )

    if settings.thinking_sounds:
        background = BackgroundAudioPlayer(
            thinking_sound=[
                AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING, volume=0.25, probability=0.6),
                AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING2, volume=0.2, probability=0.4),
            ]
        )
        await background.start(room=ctx.room, agent_session=session)

    # Décroché : une phrase fixe, sans passer par le LLM (latence minimale).
    session.say(build_greeting(tenant), allow_interruptions=True)

    async def _watchdog() -> None:
        await asyncio.sleep(settings.max_call_duration_s)
        log.warning("appel %s: durée max atteinte", state.call_id)
        await session.say(
            "Je vais devoir vous laisser, je transmets tout de suite votre demande au gérant. "
            "Bonne journée !",
            allow_interruptions=False,
        ).wait_for_playout()
        await ctx.delete_room()

    watchdog = asyncio.create_task(_watchdog())

    async def _cancel_watchdog(_: str) -> None:
        watchdog.cancel()

    ctx.add_shutdown_callback(_cancel_watchdog)


if __name__ == "__main__":
    cli.run_app(server)
