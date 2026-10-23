"""Numérotation continue des documents : DEV-2026-0001, FAC-2026-0001, AV-2026-0001.

La loi impose pour les factures une numérotation chronologique et continue,
sans trou. Le numéro n'est donc attribué qu'au moment où le document devient
définitif (envoi d'un devis, émission d'une facture), dans la même
transaction : un brouillon abandonné ne consomme jamais de numéro.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..crm.db import DocumentCounter


def next_number(session: Session, tenant_id: str, kind: str, when: datetime) -> str:
    year = when.year
    # L'UPDATE pose le verrou d'écriture : deux émissions simultanées sont
    # sérialisées et ne peuvent pas obtenir le même numéro.
    bumped = session.execute(
        update(DocumentCounter)
        .where(DocumentCounter.tenant_id == tenant_id, DocumentCounter.kind == kind,
               DocumentCounter.year == year)
        .values(last=DocumentCounter.last + 1)
    ).rowcount
    if not bumped:
        session.add(DocumentCounter(tenant_id=tenant_id, kind=kind, year=year, last=1))
        session.flush()
    last = session.scalar(select(DocumentCounter.last).where(
        DocumentCounter.tenant_id == tenant_id, DocumentCounter.kind == kind,
        DocumentCounter.year == year))
    return f"{kind}-{year}-{last:04d}"
