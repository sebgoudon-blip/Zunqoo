"""Résumé du soir envoyé au gérant sur WhatsApp.

Une fois par jour, à l'heure choisie (19 h par défaut, heure du commerce) :
l'activité du jour, ce qui reste à faire et ce qui est prévu demain. Seuls les
modules activés y figurent.

Template Meta à faire approuver (catégorie UTILITY, langue fr), nom
``zunqoo_resume_soir`` :

    🌙 Résumé du {{1}}
    📊 Aujourd'hui : {{2}}
    ✅ À faire : {{3}}
    📅 Demain : {{4}}
    Détails : {{5}}
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.db import Appointment, ExtrasSettings, Payment, Quote
from ..crm.modules import ModuleKey
from ..crm.services import enabled_modules
from ..crm.today import JOURS, MOIS, today_overview
from ..documents.pdf import fmt_money
from ..whatsapp.client import WhatsAppClient, WhatsAppError
from ..whatsapp.formatter import _flat
from ..whatsapp.notifier import credentials_for

log = logging.getLogger(__name__)


def extras_settings(session: Session, tenant_id: str) -> ExtrasSettings:
    row = session.get(ExtrasSettings, tenant_id)
    if row is None:
        row = ExtrasSettings(tenant_id=tenant_id)
        session.add(row)
        session.flush()
    return row


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _qty(t: dict) -> str:
    q = t.get("quantity") or 0
    n = str(int(q)) if float(q).is_integer() else str(q).replace(".", ",")
    return f"{n}{' ' + t['unit'] if t.get('unit') else ''} {t['product']}"


@dataclass
class EveningSummary:
    date_label: str
    activity: list[str]
    todo: list[str]
    tomorrow: list[str]
    link: str

    def text(self, business: str) -> str:
        parts = [f"🌙 *Résumé du {self.date_label}* — {business}", ""]
        parts += [f"📊 {line}" for line in self.activity] or ["📊 Journée calme : aucune activité."]
        parts.append("")
        parts += [f"✅ {line}" for line in self.todo] or ["✅ Rien en attente, tout est à jour."]
        parts.append("")
        parts.append("📅 *Demain*")
        parts += [f"• {line}" for line in self.tomorrow] or ["• Rien de prévu pour l'instant."]
        parts += ["", f"👉 {self.link}"]
        return "\n".join(parts)

    def template_params(self) -> list[str]:
        return [
            _flat(self.date_label, limit=60),
            _flat(" · ".join(self.activity) or "journée calme", limit=700),
            _flat(" · ".join(self.todo) or "rien en attente", limit=500),
            _flat(" · ".join(self.tomorrow) or "rien de prévu", limit=700),
            self.link,
        ]


def build_summary(session: Session, settings: Settings, tenant: TenantConfig,
                  now: datetime | None = None) -> EveningSummary:
    zone = ZoneInfo(tenant.timezone)
    now = (now or datetime.now(UTC)).astimezone(zone)
    today = now.date()
    tomorrow = today + timedelta(days=1)
    start_of_day = datetime.combine(today, datetime.min.time(), zone).astimezone(UTC)
    modules = enabled_modules(session, tenant.id)
    ov = today_overview(session, tenant.id, tenant.timezone, modules, now=now)
    day = ov["today"]

    activity: list[str] = []
    if day["calls"] is not None:
        line = _plural(day["calls"], "appel")
        if day["orders"]:
            line += f", dont {_plural(day['orders'], 'commande')}"
        activity.append(line)
    if day["emails"]:
        line = _plural(day["emails"], "e-mail reçu", "e-mails reçus")
        if day["emails_auto"]:
            line += f" ({day['emails_auto']} répondu{'s' if day['emails_auto'] > 1 else ''} seul)"
        activity.append(line)
    if day["new_contacts"]:
        activity.append(_plural(day["new_contacts"], "nouveau client", "nouveaux clients"))
    if ModuleKey.QUOTES in modules:
        accepted = session.scalar(select(func.count()).select_from(Quote).where(
            Quote.tenant_id == tenant.id, Quote.status == "accepte",
            Quote.decided_at >= start_of_day)) or 0
        if accepted:
            activity.append(_plural(accepted, "devis accepté", "devis acceptés"))
    if ModuleKey.INVOICES in modules:
        paid = session.scalar(select(func.sum(Payment.amount)).where(
            Payment.tenant_id == tenant.id, Payment.paid_on >= start_of_day))
        if paid:
            activity.append(f"{fmt_money(Decimal(paid))} encaissés")

    todo: list[str] = []
    if ov["todo"]["approvals_count"]:
        todo.append(_plural(ov["todo"]["approvals_count"], "élément à valider", "éléments à valider"))
    if ov["todo"]["callbacks"]:
        todo.append(_plural(len(ov["todo"]["callbacks"]), "client à rappeler", "clients à rappeler"))
    if ov["orders"] and ov["orders"]["undated"]:
        todo.append(_plural(len(ov["orders"]["undated"]), "commande sans date", "commandes sans date"))
    if ov["invoices"] and ov["invoices"]["overdue_count"]:
        todo.append(f"{_plural(ov['invoices']['overdue_count'], 'facture en retard', 'factures en retard')}"
                    f" ({fmt_money(Decimal(str(ov['invoices']['overdue_total'])))})")

    upcoming: list[str] = []
    if ov["orders"]:
        for d in ov["orders"]["upcoming"]:
            if d["date"] == tomorrow.isoformat():
                totals = ", ".join(_qty(t) for t in d["totals"][:6])
                upcoming.append(f"{_plural(len(d['orders']), 'commande')}"
                                + (f" : {totals}" if totals else ""))
    if ModuleKey.APPOINTMENTS in modules:
        t_start = datetime.combine(tomorrow, datetime.min.time(), zone).astimezone(UTC)
        for a in session.scalars(select(Appointment).where(
                Appointment.tenant_id == tenant.id, Appointment.status != "annule",
                Appointment.start >= t_start, Appointment.start < t_start + timedelta(days=1))
                .order_by(Appointment.start)):
            who = a.contact.display_name if a.contact else "client"
            flag = " (à confirmer)" if a.status == "a_confirmer" else ""
            upcoming.append(f"{a.start.astimezone(zone):%H:%M} {who} — {a.type_name}{flag}")

    label = f"{JOURS[today.weekday()]} {today.day} {MOIS[today.month - 1]}"
    return EveningSummary(date_label=label, activity=activity, todo=todo, tomorrow=upcoming,
                          link=settings.crm_public_url.rstrip("/"))


async def send_summary(tenant: TenantConfig, summary: EveningSummary, settings: Settings, *,
                       client: WhatsAppClient | None = None) -> dict[str, str]:
    """Template d'abord (fonctionne hors fenêtre de 24 h), repli texte sinon."""
    recipients = tenant.whatsapp.manager_numbers
    if not recipients:
        log.warning("tenant %s: aucun numéro WhatsApp gérant pour le résumé", tenant.id)
        return {}
    lang = tenant.whatsapp.template_lang or settings.whatsapp_template_lang
    owns = client is None
    client = client or WhatsAppClient(credentials_for(tenant, settings))
    sent: dict[str, str] = {}
    try:
        for to in recipients:
            try:
                sent[to] = await client.send_template(
                    to, settings.whatsapp_summary_template, lang, summary.template_params())
                continue
            except WhatsAppError as exc:
                log.warning("template de résumé indisponible (%s), repli texte", exc)
            try:
                sent[to] = await client.send_text(to, summary.text(tenant.profile.name))
            except WhatsAppError as exc:
                log.error("résumé du soir non envoyé à %s: %s", to, exc)
    finally:
        if owns:
            await client.aclose()
    return sent


def summary_due(cfg: ExtrasSettings, local_now: datetime) -> bool:
    """À l'heure choisie, un jour coché, une seule fois par jour (même si le
    service redémarre). Passé minuit, on ne rattrape pas la veille."""
    hh, mm = (int(x) for x in cfg.summary_time.split(":"))
    return (local_now.weekday() in (cfg.summary_days or [])
            and (local_now.hour, local_now.minute) >= (hh, mm)
            and cfg.summary_last_sent != local_now.date().isoformat())


async def send_due_summary(session: Session, settings: Settings, tenant: TenantConfig,
                           now: datetime) -> bool:
    if ModuleKey.DAILY_SUMMARY not in enabled_modules(session, tenant.id):
        return False
    cfg = extras_settings(session, tenant.id)
    local_now = now.astimezone(ZoneInfo(tenant.timezone))
    if not summary_due(cfg, local_now):
        return False
    cfg.summary_last_sent = local_now.date().isoformat()  # une tentative par jour
    session.flush()
    summary = build_summary(session, settings, tenant, now)
    return bool(await send_summary(tenant, summary, settings))
