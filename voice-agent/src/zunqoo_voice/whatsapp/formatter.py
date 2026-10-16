"""Mise en forme du compte-rendu d'appel pour WhatsApp.

Deux sorties pour un même compte-rendu :

- ``format_report_text`` : message libre (gras WhatsApp = *texte*), utilisable
  quand le gérant a écrit au numéro Business dans les dernières 24 h.
- ``template_parameters`` : les variables du template approuvé par Meta,
  obligatoire hors fenêtre de 24 h. Meta refuse les retours à la ligne et
  les tabulations dans une variable (erreur 132018), d'où l'aplatissement.
"""

from __future__ import annotations

import re

from ..core.models import CallIntent, CallRecord, CallReport, OrderLine

_INTENT_HEADERS = {
    CallIntent.ORDER: "🛎️ *Nouvelle commande reçue !*",
    CallIntent.ORDER_CHANGE: "✏️ *Modification de commande*",
    CallIntent.CANCELLATION: "❌ *Annulation de commande*",
    CallIntent.INFORMATION: "ℹ️ *Demande de renseignement*",
    CallIntent.COMPLAINT: "⚠️ *Réclamation client*",
    CallIntent.CALLBACK: "📞 *Demande de rappel*",
    CallIntent.OTHER: "🛎️ *Nouvel appel reçu*",
}

_FULFILLMENT_LABEL = {"retrait": "Retrait prévu", "livraison": "Livraison prévue"}


def format_phone(number: str | None) -> str | None:
    """+33612345678 / 0612345678 -> 06 12 34 56 78 (autres pays : inchangé)."""
    if not number:
        return None
    digits = re.sub(r"\D", "", number)
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("0"):
        return " ".join(digits[i : i + 2] for i in range(0, 10, 2))
    return number


def _format_quantity(q: float) -> str:
    return str(int(q)) if float(q).is_integer() else f"{q:g}".replace(".", ",")


def format_order_line(line: OrderLine) -> str:
    qty = _format_quantity(line.quantity)
    unit = f" {line.unit}" if line.unit and line.unit not in ("pièce", "piece", "unité") else ""
    text = f"{qty}{unit} {line.product}" if unit else f"{qty} {line.product}"
    if line.notes:
        text += f" ({line.notes})"
    return text


def customer_label(report: CallReport | None, caller_number: str | None) -> str:
    name = " ".join(
        p for p in (report.customer_first_name, report.customer_last_name) if p
    ) if report else ""
    phone = format_phone((report.customer_phone if report else None) or caller_number)
    if name and phone:
        return f"{name} ({phone})"
    return name or phone or "Inconnu (numéro masqué)"


def schedule_label(report: CallReport) -> str | None:
    when = report.requested_day
    if report.requested_date and report.requested_date not in (when or ""):
        when = f"{when} — {report.requested_date}" if when else report.requested_date
    where = report.pickup_location if report.fulfillment != "livraison" else report.delivery_address
    if when and where:
        return f"{when} ({where})"
    return when or where


def format_report_text(record: CallRecord) -> str:
    report = record.report
    if report is None:
        return "\n".join(
            [
                "🛎️ *Nouvel appel reçu*",
                f"👤 *Client :* {customer_label(None, record.caller_number)}",
                f"⏱️ *Durée :* {int(record.duration_s // 60)} min {int(record.duration_s % 60)} s",
                "⚠️ Analyse automatique indisponible, extrait de l'appel :",
                f"_{record.transcript[-600:]}_",
            ]
        )

    lines = [_INTENT_HEADERS.get(report.intent, _INTENT_HEADERS[CallIntent.OTHER])]
    lines.append(f"👤 *Client :* {customer_label(report, record.caller_number)}")
    if report.order_lines:
        lines.append("🍗 *Commande :* " + ", ".join(format_order_line(l) for l in report.order_lines))
    schedule = schedule_label(report)
    if schedule:
        label = _FULFILLMENT_LABEL.get(report.fulfillment, "Date souhaitée")
        lines.append(f"📅 *{label} :* {schedule}")
    if report.customer_notes:
        lines.append(f'📝 *Notes :* "{report.customer_notes}"')
    lines.append(f"💬 *Résumé :* {report.summary}")
    if report.needs_callback:
        lines.append("☎️ *À rappeler*")
    return "\n".join(lines)


def _flat(value: str | None, fallback: str = "—", limit: int = 900) -> str:
    """Valeur compatible variable de template Meta (une ligne, ≤ 4 espaces)."""
    if not value:
        return fallback
    value = re.sub(r"[\t\r\n]+", " · ", value)
    value = re.sub(r" {4,}", "   ", value).strip()
    return value[:limit]


def template_parameters(record: CallRecord) -> list[str]:
    """Variables {{1}}..{{5}} du template ``zunqoo_call_report``.

    Corps du template à faire approuver (catégorie UTILITY, langue fr) :

        🛎️ {{1}}
        👤 Client : {{2}}
        🍗 Commande : {{3}}
        📅 Retrait / livraison : {{4}}
        📝 Notes : {{5}}
    """
    report = record.report
    if report is None:
        return [
            "Nouvel appel (analyse indisponible)",
            _flat(customer_label(None, record.caller_number)),
            "—",
            "—",
            _flat(record.transcript[-300:]),
        ]
    title = _INTENT_HEADERS.get(report.intent, "").replace("*", "").split(" ", 1)[-1]
    notes = " — ".join(n for n in (report.customer_notes, report.summary) if n)
    return [
        _flat(title),
        _flat(customer_label(report, record.caller_number)),
        _flat(", ".join(format_order_line(l) for l in report.order_lines)),
        _flat(schedule_label(report)),
        _flat(notes),
    ]
