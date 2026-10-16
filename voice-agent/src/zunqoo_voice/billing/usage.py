"""Comptage de la consommation (minutes d'appel) par tenant et par mois.

SQLite suffit pour une instance ; en SaaS multi-instances, remplacer par
Postgres en gardant la même interface. Les relevés mensuels alimentent la
facturation (Stripe metered billing, ou export CSV pour la facturation
manuelle).
"""

from __future__ import annotations

import math
import sqlite3
from datetime import datetime
from pathlib import Path

from ..core.models import TenantConfig
from .plans import entitlements_for

_SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    call_id     TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    month       TEXT NOT NULL,            -- AAAA-MM
    started_at  TEXT NOT NULL,
    duration_s  REAL NOT NULL,
    intent      TEXT
);
CREATE INDEX IF NOT EXISTS calls_tenant_month ON calls (tenant_id, month);
"""


class UsageMeter:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path)
        self._db.executescript(_SCHEMA)

    def record_call(
        self, tenant_id: str, call_id: str, started_at: datetime, duration_s: float,
        intent: str | None = None,
    ) -> None:
        with self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO calls VALUES (?, ?, ?, ?, ?, ?)",
                (call_id, tenant_id, started_at.strftime("%Y-%m"), started_at.isoformat(),
                 duration_s, intent),
            )

    def billable_minutes(self, tenant_id: str, month: str) -> int:
        """Minutes facturables : chaque appel est arrondi à la minute supérieure."""
        rows = self._db.execute(
            "SELECT duration_s FROM calls WHERE tenant_id = ? AND month = ?", (tenant_id, month)
        ).fetchall()
        return sum(math.ceil(d / 60) for (d,) in rows)

    def quota_remaining(self, tenant: TenantConfig, now: datetime) -> int | None:
        quota = entitlements_for(tenant.plan).monthly_minutes
        if quota is None:
            return None
        return quota - self.billable_minutes(tenant.id, now.strftime("%Y-%m"))

    def monthly_statement(self, month: str) -> list[dict]:
        rows = self._db.execute(
            "SELECT tenant_id, COUNT(*), SUM(duration_s) FROM calls WHERE month = ? "
            "GROUP BY tenant_id",
            (month,),
        ).fetchall()
        return [
            {"tenant_id": t, "calls": n, "minutes": self.billable_minutes(t, month),
             "raw_seconds": round(s or 0)}
            for t, n, s in rows
        ]
