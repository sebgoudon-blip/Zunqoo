"""Calcul des créneaux libres (fonction pure, sans réseau).

Entrées : les disponibilités hebdomadaires du commerce (ex. mardi 9h-12h et
14h-18h), les périodes déjà occupées dans Google Agenda, la durée du
rendez-vous, une marge entre deux rendez-vous, un délai minimum de
prévenance et un horizon de réservation. Tout est calculé dans le fuseau
du commerce, changements d'heure compris.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


@dataclass(frozen=True)
class Busy:
    start: datetime  # aware
    end: datetime


@dataclass
class SlotRules:
    weekly: dict[str, list[tuple[str, str]]]  # {"mardi": [("09:00", "12:00"), ...]}
    duration_min: int
    buffer_min: int = 0
    step_min: int = 30
    min_notice_hours: int = 2
    horizon_days: int = 21


def _hm(text: str) -> time:
    h, m = text.split(":")
    return time(int(h), int(m))


def free_slots(rules: SlotRules, busy: list[Busy], *, now: datetime, tz: str,
               limit: int = 50, on_day: date | None = None) -> list[datetime]:
    """Débuts de créneaux libres (aware, fuseau du commerce), dans l'ordre."""
    zone = ZoneInfo(tz)
    now_local = now.astimezone(zone)
    earliest = now_local + timedelta(hours=rules.min_notice_hours)
    duration = timedelta(minutes=rules.duration_min)
    gap = timedelta(minutes=rules.buffer_min)
    step = timedelta(minutes=rules.step_min)
    # La marge s'applique autour des rendez-vous existants.
    blocked = sorted(((b.start - gap, b.end + gap) for b in busy), key=lambda x: x[0])

    days = [on_day] if on_day else [now_local.date() + timedelta(days=i)
                                    for i in range(rules.horizon_days + 1)]
    out: list[datetime] = []
    for d in days:
        if (d - now_local.date()).days > rules.horizon_days or d < now_local.date():
            continue
        for start_s, end_s in rules.weekly.get(JOURS[d.weekday()], []):
            window_start = datetime.combine(d, _hm(start_s), zone)
            window_end = datetime.combine(d, _hm(end_s), zone)
            t = window_start
            while t + duration <= window_end:
                if t >= earliest and not any(s < t + duration and t < e for s, e in blocked):
                    out.append(t)
                    if len(out) >= limit:
                        return out
                t += step
    return out


def spread(slots: list[datetime], n: int = 3) -> list[datetime]:
    """Choisit n créneaux variés (jours ou moments différents) plutôt que 3 à la suite."""
    picked: list[datetime] = []
    for s in slots:
        if all(s.date() != p.date() or abs((s - p).total_seconds()) >= 3 * 3600 for p in picked):
            picked.append(s)
        if len(picked) == n:
            return picked
    for s in slots:  # pas assez de variété : on complète dans l'ordre
        if s not in picked:
            picked.append(s)
        if len(picked) == n:
            break
    return sorted(picked)


MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def spoken(dt: datetime, *, today: date | None = None) -> str:
    """« demain à 10 h 30 », « mardi 4 novembre à 14 h »."""
    d = dt.date()
    if today and d == today:
        day = "aujourd'hui"
    elif today and d == today + timedelta(days=1):
        day = "demain"
    else:
        day = f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]}"
    minutes = f" {dt.minute:02d}" if dt.minute else ""
    return f"{day} à {dt.hour} h{minutes}"
