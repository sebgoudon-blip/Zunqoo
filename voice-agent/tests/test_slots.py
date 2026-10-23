from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from zunqoo_voice.agenda.slots import Busy, SlotRules, free_slots, spoken, spread

PARIS = ZoneInfo("Europe/Paris")
RULES = SlotRules(weekly={"mardi": [("09:00", "12:00"), ("14:00", "16:00")]},
                  duration_min=60, buffer_min=15, step_min=30, min_notice_hours=2, horizon_days=14)
MONDAY_8H = datetime(2026, 10, 26, 8, 0, tzinfo=PARIS)  # lundi


def p(day, h, m=0):
    return datetime(2026, 10, day, h, m, tzinfo=PARIS)


def test_slots_respect_windows_duration_and_step():
    slots = free_slots(RULES, [], now=MONDAY_8H, tz="Europe/Paris", on_day=date(2026, 10, 27))
    assert [s.strftime("%H:%M") for s in slots] == [
        "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00"]


def test_busy_periods_and_buffer_are_excluded():
    # RDV existant 10h-11h + marge de 15 min : la matinée bloquée de 9h45 à 11h15,
    # donc aucun créneau d'une heure ne tient le matin.
    busy = [Busy(p(27, 10), p(27, 11))]
    slots = free_slots(RULES, busy, now=MONDAY_8H, tz="Europe/Paris", on_day=date(2026, 10, 27))
    assert [s.strftime("%H:%M") for s in slots] == ["14:00", "14:30", "15:00"]


def test_min_notice_and_horizon():
    tuesday_10h = p(27, 10)
    slots = free_slots(RULES, [], now=tuesday_10h, tz="Europe/Paris", limit=3)
    assert slots[0] == p(27, 14)  # rien avant midi (+2 h de prévenance)
    far = free_slots(RULES, [], now=MONDAY_8H, tz="Europe/Paris", limit=100)
    assert max(far).date() <= (MONDAY_8H + timedelta(days=14)).date()


def test_daylight_saving_change():
    # Passage à l'heure d'hiver le 25 octobre 2026 : 9h locale reste 9h locale.
    slots = free_slots(SlotRules(weekly={"lundi": [("09:00", "10:00")]}, duration_min=60,
                                 min_notice_hours=0), [],
                       now=datetime(2026, 10, 24, 12, tzinfo=UTC), tz="Europe/Paris", limit=1)
    assert slots[0] == p(26, 9) and slots[0].utcoffset() == timedelta(hours=1)


def test_spread_and_spoken():
    slots = free_slots(RULES, [], now=MONDAY_8H, tz="Europe/Paris", limit=50)
    picked = spread(slots, 3)
    assert len(picked) == 3 and picked[0] == p(27, 9) and picked[1].hour >= 12
    assert spoken(p(27, 14, 30), today=date(2026, 10, 26)) == "demain à 14 h 30"
    assert spoken(p(27, 9), today=date(2026, 10, 1)) == "mardi 27 octobre à 9 h"
