"""Exécution des décisions « Valider / Refuser ».

Chaque type d'action (``kind``) enregistre son exécuteur : envoi d'un
e-mail, d'un devis, d'une facture… Les modules des étapes suivantes
s'y branchent avec ``@executor("email_reponse")``.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..core.config import Settings
from .db import Approval

log = logging.getLogger(__name__)

Executor = Callable[[Session, Approval, Settings], Awaitable[str]]
_EXECUTORS: dict[str, Executor] = {}
_ON_REFUSE: dict[str, Executor] = {}


def on_refuse(kind: str) -> Callable[[Executor], Executor]:
    """Action à mener quand le gérant refuse (ex. libérer un créneau bloqué)."""
    def register(fn: Executor) -> Executor:
        _ON_REFUSE[kind] = fn
        return fn
    return register


def executor(kind: str) -> Callable[[Executor], Executor]:
    def register(fn: Executor) -> Executor:
        _EXECUTORS[kind] = fn
        return fn
    return register


class ApprovalError(RuntimeError):
    pass


class ApprovalBlocked(ValueError):
    """L'action ne peut pas encore partir (ex. ligne de devis sans prix) :
    la demande reste en attente, le gérant corrige puis revalide."""


async def decide(
    session: Session,
    settings: Settings,
    *,
    tenant_id: str,
    approval_id: str,
    approve: bool,
    decided_by: str,
    channel: str,
    edits: dict | None = None,
) -> Approval:
    # Verrou optimiste : si le gérant clique sur WhatsApp et sur le web en même
    # temps, une seule décision passe.
    claimed = session.execute(
        update(Approval)
        .where(Approval.id == approval_id, Approval.tenant_id == tenant_id,
               Approval.status == "en_attente")
        .values(status="en_cours", decided_at=datetime.now(UTC), decided_by=decided_by,
                decision_channel=channel)
    ).rowcount
    approval = session.get(Approval, approval_id)
    if approval is None or approval.tenant_id != tenant_id:
        raise ApprovalError("élément introuvable")
    session.refresh(approval)
    if not claimed:
        raise ApprovalError("déjà traité")

    if not approve:
        approval.status = "refuse"
        undo = _ON_REFUSE.get(approval.kind)
        if undo is not None:
            try:
                approval.result = await undo(session, approval, settings)
            except Exception as exc:
                log.exception("annulation après refus de %s échouée", approval.id)
                approval.result = f"refusé, mais : {exc}"
        session.flush()
        return approval

    if edits:
        approval.payload = {**approval.payload, **edits}
    run = _EXECUTORS.get(approval.kind)
    if run is None:
        approval.status, approval.result = "approuve", "validé (aucune action automatique)"
        session.flush()
        return approval
    try:
        approval.result = await run(session, approval, settings)
        approval.status = "execute"
    except ApprovalBlocked as exc:
        approval.status, approval.result = "en_attente", str(exc)
        approval.decided_at = approval.decided_by = approval.decision_channel = None
        session.flush()
        raise ApprovalError(str(exc)) from exc
    except Exception as exc:
        log.exception("exécution de %s (%s) échouée", approval.id, approval.kind)
        approval.status, approval.result = "echec", str(exc)
    session.flush()
    return approval
