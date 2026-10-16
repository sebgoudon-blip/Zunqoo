"""Outils (function calling) exposés au LLM pendant l'appel."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from livekit.agents import RunContext, ToolError, function_tool, get_job_context

from ..core.models import OrderLine, TenantConfig
from .prompts import JOURS

log = logging.getLogger(__name__)


@dataclass
class CallState:
    """État partagé de l'appel (``session.userdata``)."""

    tenant: TenantConfig
    call_id: str
    caller_number: str | None
    caller_identity: str | None
    started_at: datetime
    confirmed_order: dict | None = None
    transferred: bool = False
    ended_by_agent: bool = False
    extra: dict = field(default_factory=dict)


def _resolve_day(day: str, tz: str) -> tuple[str, datetime]:
    """'aujourd'hui' / 'demain' / 'samedi' / '2026-10-17' -> (jour, date)."""
    now = datetime.now(ZoneInfo(tz))
    key = day.strip().lower()
    if key in ("aujourd'hui", "aujourdhui", "ce jour"):
        target = now
    elif key == "demain":
        target = now + timedelta(days=1)
    elif key == "après-demain":
        target = now + timedelta(days=2)
    elif key in JOURS:
        delta = (JOURS.index(key) - now.weekday()) % 7
        target = now + timedelta(days=delta)
    else:
        try:
            target = datetime.fromisoformat(key).replace(tzinfo=ZoneInfo(tz))
        except ValueError as exc:
            raise ToolError(f"jour non reconnu : {day}") from exc
    return JOURS[target.weekday()], target


def planning_for_day(tenant: TenantConfig, day: str) -> str:
    weekday, date = _resolve_day(day, tenant.timezone)
    p = tenant.profile
    shop = [s for s in p.opening_hours if s.day == weekday]
    markets = [m for m in p.market_presence if m.day == weekday]
    lines = [f"{weekday} {date.day}/{date.month}"]
    if shop:
        lines.append(
            "Boutique : " + ", ".join(f"{s.opens}-{s.closes}" + (f" ({s.note})" if s.note else "")
                                      for s in shop)
        )
    for m in markets:
        hours = f" {m.opens}-{m.closes}" if m.opens and m.closes else ""
        lines.append(f"Marché : {m.place}{hours}" + (f" ({m.note})" if m.note else ""))
    if p.delivery.available and weekday in p.delivery.days:
        lines.append("Livraison possible ce jour-là" + (f" ({', '.join(p.delivery.zones)})"
                                                         if p.delivery.zones else ""))
    if len(lines) == 1:
        lines.append("Fermé / pas de présence connue ce jour-là.")
    return " ; ".join(lines)


@function_tool
async def consulter_planning(context: RunContext[CallState], jour: str) -> str:
    """Donne les horaires de la boutique, les marchés et la livraison pour un jour.

    Args:
        jour: "aujourd'hui", "demain", un jour de la semaine ("samedi") ou une date AAAA-MM-JJ.
    """
    return planning_for_day(context.userdata.tenant, jour)


@function_tool
async def enregistrer_commande(
    context: RunContext[CallState],
    produits: list[OrderLine],
    prenom: str,
    nom: str,
    telephone: str,
    jour_retrait: str,
    lieu_retrait: str | None = None,
    adresse_livraison: str | None = None,
    remarques: str | None = None,
) -> str:
    """Enregistre la commande, uniquement APRÈS que le client a confirmé le récapitulatif.

    Args:
        produits: les lignes de commande (produit, quantité, unité, remarque éventuelle).
        prenom: prénom du client.
        nom: nom du client.
        telephone: numéro de rappel, chiffres uniquement.
        jour_retrait: jour et moment souhaités tels que dits par le client ("samedi matin").
        lieu_retrait: boutique ou marché de retrait, si retrait.
        adresse_livraison: adresse, si livraison.
        remarques: demandes particulières du client.
    """
    if not produits:
        raise ToolError("la commande ne contient aucun produit")
    order = {
        "produits": [l.model_dump(exclude_none=True) for l in produits],
        "client": f"{prenom} {nom}".strip(),
        "telephone": telephone,
        "jour": jour_retrait,
        "lieu": lieu_retrait,
        "adresse_livraison": adresse_livraison,
        "remarques": remarques,
    }
    context.userdata.confirmed_order = order
    log.info("commande enregistrée pour %s: %s", context.userdata.tenant.id, order)
    # Point d'extension : pousser la commande dans la file Zunqoo (Firestore),
    # un POS ou un Google Agenda. Le compte-rendu WhatsApp part en fin d'appel.
    return "Commande enregistrée. Confirme brièvement au client et demande s'il désire autre chose."


@function_tool
async def transferer_appel(context: RunContext[CallState]) -> str:
    """Transfère l'appel au gérant quand le client demande à parler à quelqu'un."""
    state = context.userdata
    if not state.tenant.transfer_number or not state.caller_identity:
        raise ToolError("transfert indisponible, propose un rappel à la place")
    await context.session.say("Je vous passe quelqu'un tout de suite, ne quittez pas.",
                              allow_interruptions=False)
    try:
        await get_job_context().transfer_sip_participant(
            state.caller_identity, f"tel:{state.tenant.transfer_number}", play_dialtone=True
        )
    except Exception as exc:
        log.error("transfert échoué: %s", exc)
        raise ToolError("le transfert a échoué, excuse-toi et propose un rappel") from exc
    state.transferred = True
    return "Appel transféré."


@function_tool
async def terminer_appel(context: RunContext[CallState]) -> None:
    """Raccroche, une fois que le client a dit au revoir et que tu l'as salué."""
    context.userdata.ended_by_agent = True
    # On laisse la formule de politesse finir de jouer avant de raccrocher.
    await context.wait_for_playout()
    await asyncio.sleep(0.5)
    # Supprimer la room raccroche la jambe SIP ; les callbacks de fin d'appel
    # (compte-rendu WhatsApp) s'exécutent ensuite normalement.
    await get_job_context().delete_room()


ALL_TOOLS = [consulter_planning, enregistrer_commande, transferer_appel, terminer_appel]
