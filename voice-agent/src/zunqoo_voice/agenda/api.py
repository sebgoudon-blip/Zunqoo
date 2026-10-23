"""Routes du CRM : réglages des rendez-vous, créneaux, agenda."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from ..core.config import Settings, get_settings
from ..crm.api import DB, CurrentUser, require_admin, tenant_of
from ..crm.db import Appointment, Contact, User
from .service import AgendaError, book, cancel, find_slots, settings_for
from .slots import JOURS, spoken

router = APIRouter(prefix="/api/agenda")
_HM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ApptType(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]{1,40}$")
    name: str = Field(min_length=1, max_length=120)
    duration: int = Field(ge=5, le=480)
    description: str | None = ""


class AgendaSettingsIn(BaseModel):
    types: list[ApptType] | None = None
    weekly: dict[str, list[tuple[str, str]]] | None = None
    buffer_min: int | None = Field(default=None, ge=0, le=120)
    step_min: int | None = Field(default=None, ge=5, le=120)
    min_notice_hours: int | None = Field(default=None, ge=0, le=168)
    horizon_days: int | None = Field(default=None, ge=1, le=120)
    location: str | None = None
    calendar_id: str | None = None

    @field_validator("weekly")
    @classmethod
    def _check_weekly(cls, value):
        if value is None:
            return value
        for day, ranges in value.items():
            if day not in JOURS:
                raise ValueError(f"jour inconnu : {day}")
            for start, end in ranges:
                if not (_HM.match(start) and _HM.match(end)) or start >= end:
                    raise ValueError(f"plage horaire invalide le {day} : {start}-{end}")
        return value


def _settings_out(s) -> dict:
    return {"types": s.types, "weekly": s.weekly, "buffer_min": s.buffer_min,
            "step_min": s.step_min, "min_notice_hours": s.min_notice_hours,
            "horizon_days": s.horizon_days, "location": s.location, "calendar_id": s.calendar_id}


@router.get("/settings")
def get_agenda_settings(user: CurrentUser, session: DB) -> dict:
    return _settings_out(settings_for(session, user.tenant_id))


@router.patch("/settings")
def update_agenda_settings(body: AgendaSettingsIn, session: DB,
                           user: User = Depends(require_admin)) -> dict:
    s = settings_for(session, user.tenant_id)
    data = body.model_dump(exclude_unset=True)
    if "types" in data:
        if not data["types"]:
            raise HTTPException(status_code=400, detail="gardez au moins un type de rendez-vous")
        ids = [t["id"] for t in data["types"]]
        if len(ids) != len(set(ids)):
            raise HTTPException(status_code=400, detail="deux types ont le même identifiant")
    if "weekly" in data:
        data["weekly"] = {d: [list(r) for r in ranges] for d, ranges in data["weekly"].items()}
    for field, value in data.items():
        setattr(s, field, value)
    session.flush()
    return _settings_out(s)


@router.get("/slots")
async def get_slots(user: CurrentUser, session: DB, type: str | None = None,
                    day: date | None = None, settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    try:
        appt_type, slots = await find_slots(session, settings, tenant, type_ref=type, on_day=day,
                                            limit=60)
    except AgendaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    tz = ZoneInfo(tenant.timezone)
    today = datetime.now(tz).date()
    return {"type": appt_type, "slots": [
        {"start": s.isoformat(), "label": spoken(s.astimezone(tz), today=today)} for s in slots]}


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def _appt_out(a: Appointment) -> dict:
    return {"id": a.id, "type_name": a.type_name, "type_id": a.type_id,
            "start": _aware(a.start).isoformat(), "end": _aware(a.end).isoformat(),
            "status": a.status, "source": a.source, "notes": a.notes,
            "contact": {"id": a.contact.id, "name": a.contact.display_name,
                        "phone": a.contact.phone} if a.contact else None}


@router.get("/appointments")
def list_appointments(user: CurrentUser, session: DB, days: int = 30,
                      past: bool = False) -> list[dict]:
    now = datetime.now(UTC)
    start, end = (now - timedelta(days=days), now) if past else (now - timedelta(hours=12),
                                                                  now + timedelta(days=days))
    rows = session.scalars(select(Appointment).where(
        Appointment.tenant_id == user.tenant_id, Appointment.start >= start,
        Appointment.start <= end).order_by(Appointment.start))
    return [_appt_out(a) for a in rows]


class BookIn(BaseModel):
    type_id: str | None = None
    start: datetime
    contact_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


@router.post("/appointments", status_code=201)
async def create_appointment(body: BookIn, user: CurrentUser, session: DB,
                             settings: Settings = Depends(get_settings)) -> dict:
    contact = session.get(Contact, body.contact_id) if body.contact_id else None
    if body.contact_id and (contact is None or contact.tenant_id != user.tenant_id):
        raise HTTPException(status_code=400, detail="client introuvable")
    try:
        appt = await book(session, settings, tenant_of(user, settings), type_ref=body.type_id,
                          start=_aware(body.start), contact=contact, source="manuel",
                          notes=body.notes, confirmed=True)
    except AgendaError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _appt_out(appt)


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: str, user: CurrentUser, session: DB,
                             settings: Settings = Depends(get_settings)) -> dict:
    appt = session.get(Appointment, appointment_id)
    if appt is None or appt.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="rendez-vous introuvable")
    if appt.status != "annule":
        try:
            await cancel(session, settings, appt)
        except AgendaError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _appt_out(appt)
