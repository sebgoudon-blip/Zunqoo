"""« Ma journée » : ce que l'administrateur doit voir en ouvrant le CRM.

- à faire maintenant : validations en attente, clients à rappeler ;
- commandes à préparer, regroupées par jour avec le total par produit ;
- chiffres du jour.

Les éléments « traités » (rappel passé, commande retirée) sont marqués dans
``Interaction.data["handled_at"]`` et disparaissent des listes.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Approval, Contact, Interaction, MailMessage, Quote
from .modules import ModuleKey

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
UPCOMING_DAYS = 7


def day_label(d: date, today: date) -> str:
    if d == today:
        prefix = "Aujourd'hui"
    elif d == today + timedelta(days=1):
        prefix = "Demain"
    else:
        prefix = JOURS[d.weekday()].capitalize()
    return f"{prefix} {d.day} {MOIS[d.month - 1]}"


def resolve_order_date(report: dict, called_on: date) -> date | None:
    """Date de retrait/livraison : ISO si l'analyse l'a donnée, sinon déduite
    d'un « samedi » ou « demain » relatif au jour de l'appel. Jamais devinée
    au-delà."""
    iso = report.get("requested_date")
    if iso:
        try:
            return date.fromisoformat(iso)
        except ValueError:
            pass
    said = (report.get("requested_day") or "").lower()
    if not said:
        return None
    if re.search(r"\baujourd'?hui\b|\bce (midi|soir|matin)\b", said):
        return called_on
    if re.search(r"\baprès-demain\b", said):
        return called_on + timedelta(days=2)
    if re.search(r"\bdemain\b", said):
        return called_on + timedelta(days=1)
    for i, name in enumerate(JOURS):
        if re.search(rf"\b{name}\b", said):
            delta = (i - called_on.weekday()) % 7
            return called_on + timedelta(days=delta)
    return None


def _is_handled(i: Interaction) -> bool:
    return bool((i.data or {}).get("handled_at"))


def _order_out(i: Interaction, report: dict) -> dict:
    return {
        "id": i.id,
        "contact": {"id": i.contact.id, "name": i.contact.display_name,
                    "phone": i.contact.phone} if i.contact else None,
        "lines": report.get("order_lines") or [],
        "slot": report.get("requested_day"),
        "location": report.get("pickup_location") or report.get("delivery_address"),
        "fulfillment": report.get("fulfillment"),
        "notes": report.get("customer_notes"),
        "occurred_at": i.occurred_at.isoformat(),
    }


def _totals(orders: list[dict]) -> list[dict]:
    acc: dict[tuple[str, str], dict] = {}
    for order in orders:
        for line in order["lines"]:
            key = (line["product"].strip().lower(), (line.get("unit") or "").strip().lower())
            entry = acc.setdefault(key, {"product": line["product"], "unit": line.get("unit"),
                                         "quantity": 0})
            entry["quantity"] += line.get("quantity") or 0
    return sorted(acc.values(), key=lambda e: -e["quantity"])


def today_overview(session: Session, tenant_id: str, tz: str, modules: set[ModuleKey],
                   *, now: datetime | None = None) -> dict:
    now = (now or datetime.now(UTC)).astimezone(ZoneInfo(tz))
    today = now.date()
    start_of_day = datetime.combine(today, datetime.min.time(), ZoneInfo(tz)).astimezone(UTC)

    recent_calls = list(session.scalars(
        select(Interaction).where(
            Interaction.tenant_id == tenant_id, Interaction.channel == "appel",
            Interaction.occurred_at >= start_of_day - timedelta(days=30),
        ).order_by(Interaction.occurred_at)
    ))

    def occurred_local(i: Interaction) -> datetime:
        ts = i.occurred_at if i.occurred_at.tzinfo else i.occurred_at.replace(tzinfo=UTC)
        return ts.astimezone(ZoneInfo(tz))

    # --- à rappeler -------------------------------------------------------------
    callbacks = []
    for i in recent_calls:
        report = (i.data or {}).get("report") or {}
        wants_callback = report.get("needs_callback") or i.intent == "rappel_demande"
        if wants_callback and not _is_handled(i) and occurred_local(i).date() >= today - timedelta(days=14):
            callbacks.append({
                "id": i.id, "title": i.title, "summary": i.summary,
                "occurred_at": i.occurred_at.isoformat(),
                "contact": {"id": i.contact.id, "name": i.contact.display_name,
                            "phone": i.contact.phone} if i.contact else None,
            })

    # --- commandes à préparer ------------------------------------------------------
    by_day: dict[date, list[dict]] = defaultdict(list)
    undated: list[dict] = []
    if ModuleKey.ORDERS in modules:
        for i in recent_calls:
            report = (i.data or {}).get("report") or {}
            if i.intent != "commande" or not report.get("order_lines") or _is_handled(i):
                continue
            when = resolve_order_date(report, occurred_local(i).date())
            if when is None:
                if occurred_local(i).date() >= today - timedelta(days=7):
                    undated.append(_order_out(i, report))
            elif today <= when < today + timedelta(days=UPCOMING_DAYS):
                by_day[when].append(_order_out(i, report))

    upcoming = [
        {"date": d.isoformat(), "label": day_label(d, today), "orders": orders,
         "totals": _totals(orders)}
        for d, orders in sorted(by_day.items())
    ]

    # --- validations et chiffres ---------------------------------------------------
    pending = list(session.scalars(
        select(Approval).where(Approval.tenant_id == tenant_id, Approval.status == "en_attente")
        .order_by(Approval.created_at).limit(5)
    ))
    pending_count = session.query(Approval).filter_by(
        tenant_id=tenant_id, status="en_attente").count()
    calls_today = [i for i in recent_calls if occurred_local(i).date() == today]
    new_contacts = session.query(Contact).filter(
        Contact.tenant_id == tenant_id, Contact.created_at >= start_of_day).count()

    quotes = None
    if ModuleKey.QUOTES in modules:
        awaiting = list(session.scalars(
            select(Quote).where(Quote.tenant_id == tenant_id, Quote.status == "envoye")
            .order_by(Quote.sent_at)))
        quotes = {
            "awaiting_count": len(awaiting),
            "awaiting_total_ttc": float(sum((q.total_ttc for q in awaiting), 0)),
            "awaiting": [{"id": q.id, "number": q.number, "title": q.title,
                          "total_ttc": float(q.total_ttc),
                          "sent_at": q.sent_at.isoformat() if q.sent_at else None,
                          "contact": {"id": q.contact.id, "name": q.contact.display_name}
                          if q.contact else None} for q in awaiting[:5]],
        }

    return {
        "quotes": quotes,
        "date_label": f"{JOURS[today.weekday()].capitalize()} {today.day} {MOIS[today.month - 1]}",
        "todo": {
            "approvals_count": pending_count,
            "approvals": [{"id": a.id, "title": a.title, "summary": a.summary,
                           "created_at": a.created_at.isoformat()} for a in pending],
            "callbacks": callbacks,
        },
        "orders": {"upcoming": upcoming, "undated": undated}
        if ModuleKey.ORDERS in modules else None,
        "today": {
            "calls": len(calls_today) if ModuleKey.PHONE in modules else None,
            "orders": sum(1 for i in calls_today if i.intent == "commande")
            if ModuleKey.ORDERS in modules else None,
            "new_contacts": new_contacts,
            "emails": session.query(MailMessage).filter(
                MailMessage.tenant_id == tenant_id, MailMessage.received_at >= start_of_day,
                MailMessage.status != "ignore").count() if ModuleKey.EMAIL in modules else None,
            "emails_auto": session.query(MailMessage).filter(
                MailMessage.tenant_id == tenant_id, MailMessage.received_at >= start_of_day,
                MailMessage.status == "envoye_auto").count() if ModuleKey.EMAIL in modules else None,
        },
    }


def mark_handled(session: Session, tenant_id: str, interaction_id: str, by: str,
                 done: bool = True) -> Interaction | None:
    item = session.get(Interaction, interaction_id)
    if item is None or item.tenant_id != tenant_id:
        return None
    data = dict(item.data or {})  # nouvelle valeur pour que SQLAlchemy détecte le changement
    if done:
        data.update(handled_at=datetime.now(UTC).isoformat(), handled_by=by)
    else:
        data.pop("handled_at", None)
        data.pop("handled_by", None)
    item.data = data
    session.flush()
    return item
