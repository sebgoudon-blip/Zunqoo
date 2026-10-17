"""Archive des appels : un fichier JSON Lines par tenant et par mois.

Sert de filet de sécurité (une commande n'est jamais perdue si WhatsApp
échoue) et de base pour l'historique des appels du gérant.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

from .models import CallRecord


class CallArchive:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, record: CallRecord) -> Path:
        path = self.directory / record.tenant_id / f"{record.started_at:%Y-%m}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _append(self, record: CallRecord, entry: dict) -> None:
        with self._path(record).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def save(self, record: CallRecord) -> None:
        self._append(record, {"event": "call", **record.model_dump(mode="json")})

    def mark_notified(self, record: CallRecord, sent: dict[str, str]) -> None:
        self._append(
            record,
            {
                "event": "whatsapp",
                "call_id": record.call_id,
                "at": datetime.now(UTC).isoformat(),
                "delivered_to": sorted(sent),
                "ok": bool(sent),
            },
        )

    def unnotified(self, tenant_id: str, month: str) -> list[CallRecord]:
        """Appels dont le compte-rendu n'a atteint aucun gérant (à relancer)."""
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,62}", tenant_id) or not re.fullmatch(
            r"\d{4}-\d{2}", month
        ):
            return []
        path = self.directory / tenant_id / f"{month}.jsonl"
        if not path.exists():
            return []
        calls: dict[str, CallRecord] = {}
        delivered: set[str] = set()
        for line in path.read_text("utf-8").splitlines():
            entry = json.loads(line)
            if entry.pop("event") == "call":
                calls[entry["call_id"]] = CallRecord.model_validate(entry)
            elif entry["ok"]:
                delivered.add(entry["call_id"])
        return [c for cid, c in calls.items() if cid not in delivered]
