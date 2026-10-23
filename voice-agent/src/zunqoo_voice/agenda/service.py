"""Rendez-vous : créneaux libres, réservation, confirmation, annulation, rappel.

Les créneaux libres croisent les disponibilités du commerce, son agenda
Google (ce que le gérant y a noté lui-même compte comme occupé) et les
rendez-vous déjà pris par l'assistant. Avant chaque réservation, le
créneau est revérifié : deux clients ne peuvent pas obtenir le même.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.approvals import ApprovalBlocked, executor, on_refuse
from ..crm.db import Appointment, AppointmentSettings, Approval, Contact
from ..crm.services import add_interaction
from .gcal import CalendarClient, CalendarError
from .slots import Busy, SlotRules, free_slots, spoken, spread

log = logging.getLogger(__name__)


class AgendaError(ApprovalBlocked):
    pass


def settings_for(session: Session, tenant_id: str) -> AppointmentSettings:
    s = session.get(AppointmentSettings, tenant_id)
    if s is None:
        s = AppointmentSettings(tenant_id=tenant_id)
        session.add(s)
        session.flush()
    return s


def find_type(settings: AppointmentSettings, type_ref: str | None) -> dict:
    types = settings.types or []
    if not types:
        raise AgendaError("aucun type de rendez-vous n'est configuré")
    if type_ref:
        ref = type_ref.strip().lower()
        for t in types:
            if t["id"] == type_ref or t["name"].strip().lower() == ref:
                return t
        for t in types:  # « coupe » pour « Coupe homme »
            if ref in t["name"].lower() or t["name"].lower() in ref:
                return t
    return types[0]


def rules_for(settings: AppointmentSettings, appt_type: dict) -> SlotRules:
    return SlotRules(
        weekly={day: [tuple(r) for r in ranges] for day, ranges in (settings.weekly or {}).items()},
        duration_min=int(appt_type["duration"]), buffer_min=settings.buffer_min,
        step_min=settings.step_min, min_notice_hours=settings.min_notice_hours,
        horizon_days=settings.horizon_days,
    )


async def calendar_for(session: Session, settings: Settings, tenant_id: str,
                       calendar_id: str) -> CalendarClient:
    from ..mail.account import access_token, get_account

    account = get_account(session, tenant_id)
    if account is None or "calendar.events" not in (account.scopes or ""):
        raise AgendaError("Google Agenda n'est pas connecté (Réglages → Rendez-vous)")
    return CalendarClient(await access_token(settings, account), calendar_id)


def _local_busy(session: Session, tenant_id: str, start: datetime, end: datetime) -> list[Busy]:
    rows = session.scalars(select(Appointment).where(
        Appointment.tenant_id == tenant_id, Appointment.status != "annule",
        Appointment.google_event_id.is_(None), Appointment.start < end, Appointment.end > start))
    aware = lambda d: d if d.tzinfo else d.replace(tzinfo=UTC)
    return [Busy(aware(a.start), aware(a.end)) for a in rows]


async def find_slots(session: Session, settings: Settings, tenant: TenantConfig, *,
                     type_ref: str | None = None, now: datetime | None = None,
                     on_day=None, limit: int = 40, calendar: CalendarClient | None = None,
                     ) -> tuple[dict, list[datetime]]:
    now = now or datetime.now(UTC)
    cfg = settings_for(session, tenant.id)
    appt_type = find_type(cfg, type_ref)
    rules = rules_for(cfg, appt_type)
    end = now + timedelta(days=rules.horizon_days + 1)
    owns = calendar is None
    cal = calendar or await calendar_for(session, settings, tenant.id, cfg.calendar_id)
    try:
        busy = await cal.busy(now, end, tenant.timezone)
    except CalendarError as exc:
        raise AgendaError(f"agenda Google injoignable ({exc})") from exc
    finally:
        if owns:
            await cal.aclose()
    busy += _local_busy(session, tenant.id, now, end)
    return appt_type, free_slots(rules, busy, now=now, tz=tenant.timezone, limit=limit,
                                 on_day=on_day)


async def book(session: Session, settings: Settings, tenant: TenantConfig, *, type_ref: str | None,
               start: datetime, contact: Contact | None, source: str, notes: str | None = None,
               confirmed: bool = True, source_mail_id: str | None = None,
               calendar: CalendarClient | None = None) -> Appointment:
    cfg = settings_for(session, tenant.id)
    owns = calendar is None
    cal = calendar or await calendar_for(session, settings, tenant.id, cfg.calendar_id)
    try:
        appt_type, slots = await find_slots(session, settings, tenant, type_ref=type_ref,
                                            on_day=start.astimezone(ZoneInfo(tenant.timezone)).date(),
                                            limit=500, calendar=cal)
        if not any(abs((s - start).total_seconds()) < 60 for s in slots):
            raise AgendaError("ce créneau n'est plus disponible")
        end = start + timedelta(minutes=int(appt_type["duration"]))
        appt = Appointment(tenant_id=tenant.id, contact=contact, type_id=appt_type["id"],
                           type_name=appt_type["name"], start=start, end=end, source=source,
                           notes=notes, status="confirme" if confirmed else "a_confirmer",
                           source_mail_id=source_mail_id)
        session.add(appt)
        session.flush()
        who = contact.display_name if contact else "Client"
        details = "\n".join(x for x in (
            f"Client : {who}", f"Téléphone : {contact.phone}" if contact and contact.phone else None,
            f"E-mail : {contact.email}" if contact and contact.email else None,
            f"Remarques : {notes}" if notes else None, f"Pris par l'assistant ({source})") if x)
        try:
            appt.google_event_id = await cal.create(
                summary=f"{'[À confirmer] ' if not confirmed else ''}{appt_type['name']} – {who}",
                description=details, start=start, end=end, tz=tenant.timezone,
                location=cfg.location, zunqoo_id=appt.id, tentative=not confirmed)
        except CalendarError as exc:
            raise AgendaError(f"réservation impossible dans Google Agenda ({exc})") from exc
    finally:
        if owns:
            await cal.aclose()
    when = spoken(start.astimezone(ZoneInfo(tenant.timezone)))
    add_interaction(session, contact, tenant_id=tenant.id, channel="note", direction="interne",
                    intent="rendez_vous",
                    title=f"Rendez-vous {'pris' if confirmed else 'demandé'} : {appt_type['name']}",
                    summary=f"{when[0].upper()}{when[1:]}" + (f" — {notes}" if notes else ""),
                    data={"appointment_id": appt.id})
    return appt


async def _set_status(session: Session, settings: Settings, appt: Appointment, status: str) -> None:
    cfg = settings_for(session, appt.tenant_id)
    if appt.google_event_id:
        cal = await calendar_for(session, settings, appt.tenant_id, cfg.calendar_id)
        try:
            if status == "annule":
                await cal.delete(appt.google_event_id)
            else:
                who = appt.contact.display_name if appt.contact else "Client"
                await cal.update(appt.google_event_id, status="confirmed",
                                 summary=f"{appt.type_name} – {who}")
        except CalendarError as exc:
            raise AgendaError(f"Google Agenda : {exc}") from exc
        finally:
            await cal.aclose()
    appt.status = status


async def cancel(session: Session, settings: Settings, appt: Appointment) -> None:
    await _set_status(session, settings, appt, "annule")
    add_interaction(session, appt.contact, tenant_id=appt.tenant_id, channel="note",
                    direction="interne", intent="rendez_vous",
                    title=f"Rendez-vous annulé : {appt.type_name}",
                    summary=f"{_aware(appt.start):%d/%m à %H:%M}", data={"appointment_id": appt.id})


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def confirmation_text(appt: Appointment, tenant: TenantConfig, location: str | None) -> str:
    first = appt.contact.first_name if appt.contact and appt.contact.first_name else ""
    when = spoken(_aware(appt.start).astimezone(ZoneInfo(tenant.timezone)))
    where = f"\nAdresse : {location}" if location else ""
    return (f"Bonjour{(' ' + first) if first else ''},\n\nC'est confirmé : votre rendez-vous "
            f"« {appt.type_name} » est prévu {when}.{where}\n\nEn cas d'empêchement, il suffit "
            f"de répondre à cet e-mail.\n\nÀ bientôt,\n{tenant.profile.name}").strip()


async def _email_contact(session: Session, settings: Settings, tenant: TenantConfig,
                         appt: Appointment, subject: str, body: str) -> bool:
    """E-mail au client (dans le fil d'origine si la demande venait d'un e-mail)."""
    from ..crm.db import MailMessage
    from ..mail.account import access_token, get_account
    from ..mail.gmail import GmailClient, build_new, build_reply

    account = get_account(session, tenant.id)
    if (account is None or "gmail.modify" not in (account.scopes or "gmail.modify")
            or appt.contact is None or not appt.contact.email):
        return False
    gmail = GmailClient(await access_token(settings, account))
    try:
        src = session.get(MailMessage, appt.source_mail_id) if appt.source_mail_id else None
        if src is not None:
            original = await gmail.get(src.provider_id)
            msg = build_reply(original, from_email=account.email, from_name=tenant.profile.name,
                              body=body)
        else:
            msg = build_new(to_email=appt.contact.email, to_name=appt.contact.display_name,
                            from_email=account.email, from_name=tenant.profile.name,
                            subject=subject, body=body)
        await gmail.send(msg)
    finally:
        await gmail.aclose()
    add_interaction(session, appt.contact, tenant_id=tenant.id, channel="email", direction="sortant",
                    intent="rendez_vous", title=subject, summary=body[:300], body=body)
    return True


def _tenant(settings: Settings, tenant_id: str) -> TenantConfig:
    from ..core.tenant_store import FileTenantStore

    tenant = FileTenantStore(settings.tenants_dir).get(tenant_id)
    if tenant is None:
        raise AgendaError("commerce introuvable")
    return tenant


@executor("rdv_confirmation")
async def confirm_appointment(session: Session, approval: Approval, settings: Settings) -> str:
    appt = session.get(Appointment, approval.payload["appointment_id"])
    if appt is None or appt.status == "annule":
        raise AgendaError("ce rendez-vous a été annulé entre-temps")
    tenant = _tenant(settings, appt.tenant_id)
    if appt.status != "confirme":
        await _set_status(session, settings, appt, "confirme")
    body = str(approval.payload.get("email_body") or "") or confirmation_text(
        appt, tenant, settings_for(session, appt.tenant_id).location)
    sent = await _email_contact(session, settings, tenant, appt,
                                f"Rendez-vous confirmé – {tenant.profile.name}", body)
    return "rendez-vous confirmé" + (" et client prévenu par e-mail" if sent else "")


@on_refuse("rdv_confirmation")
async def release_appointment(session: Session, approval: Approval, settings: Settings) -> str:
    appt = session.get(Appointment, approval.payload["appointment_id"])
    if appt is None or appt.status == "annule":
        return "créneau déjà libéré"
    await cancel(session, settings, appt)
    return "créneau libéré dans l'agenda"


async def send_day_before_reminders(session: Session, settings: Settings, tenant: TenantConfig,
                                    now: datetime) -> int:
    """Rappel par e-mail aux clients qui ont rendez-vous le lendemain."""
    zone = ZoneInfo(tenant.timezone)
    tomorrow = (now.astimezone(zone) + timedelta(days=1)).date()
    start = datetime.combine(tomorrow, datetime.min.time(), zone).astimezone(UTC)
    end = start + timedelta(days=1)
    cfg = settings_for(session, tenant.id)
    sent = 0
    for appt in session.scalars(select(Appointment).where(
            Appointment.tenant_id == tenant.id, Appointment.status == "confirme",
            Appointment.reminder_sent.is_(False), Appointment.start >= start,
            Appointment.start < end)):
        appt.reminder_sent = True  # une seule tentative, même si le client n'a pas d'e-mail
        when = spoken(_aware(appt.start).astimezone(zone), today=now.astimezone(zone).date())
        first = appt.contact.first_name if appt.contact and appt.contact.first_name else ""
        body = (f"Bonjour{(' ' + first) if first else ''},\n\nPetit rappel : votre rendez-vous "
                f"« {appt.type_name} » est prévu {when}."
                + (f"\nAdresse : {cfg.location}" if cfg.location else "")
                + f"\n\nEn cas d'empêchement, répondez simplement à cet e-mail.\n\nÀ demain,\n"
                  f"{tenant.profile.name}")
        try:
            if await _email_contact(session, settings, tenant, appt,
                                    f"Rappel de votre rendez-vous – {tenant.profile.name}", body):
                sent += 1
        except Exception:
            log.exception("rappel du rendez-vous %s non envoyé", appt.id)
    return sent


def offer_text(slots: list[datetime], tenant: TenantConfig, now: datetime) -> list[str]:
    zone = ZoneInfo(tenant.timezone)
    today = now.astimezone(zone).date()
    return [spoken(s.astimezone(zone), today=today) for s in spread(slots, 3)]
