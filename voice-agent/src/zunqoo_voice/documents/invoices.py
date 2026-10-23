"""Factures et avoirs : brouillon, émission, envoi, paiements, relances.

Règles de la facturation française appliquées ici :
- numérotation continue FAC-AAAA-NNNN / AV-AAAA-NNNN, attribuée à l'émission ;
- une facture émise est figée (instantané vendeur/acheteur, PDF archivé) :
  ni modification ni suppression, une erreur se corrige par un avoir ;
- mentions obligatoires : identité et SIRET/TVA du vendeur, date de la vente,
  échéance, pénalités de retard et indemnité de 40 € entre professionnels,
  franchise de TVA le cas échéant, catégorie de l'opération (réforme 2026) ;
- PDF Factur-X (EN 16931) pour les plateformes de facturation électronique.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.approvals import ApprovalBlocked, executor
from ..crm.db import Approval, BusinessSettings, Contact, Invoice, Payment, Quote
from ..crm.modules import ModuleKey
from ..crm.services import add_interaction
from .facturx_xml import build_data_dict, embed, generate_xml
from .numbering import next_number
from .pdf import DocLine, DocumentView, Party, fmt_money, render_pdf
from .quotes import business_settings, clean_lines, missing_for_documents
from .totals import compute_totals

log = logging.getLogger(__name__)

UNPAID = ("emise", "partiellement_payee")
REMINDER_DAYS_AFTER_DUE = (3, 15)
CATEGORIES = {"biens": "Livraison de biens", "services": "Prestation de services",
              "mixte": "Livraison de biens et prestation de services"}


class InvoiceError(ApprovalBlocked):
    pass


def _aware(d: datetime | None) -> datetime | None:
    return d if d is None or d.tzinfo else d.replace(tzinfo=UTC)


# ---------------------------------------------------------------------------
# Parties figées
# ---------------------------------------------------------------------------


def seller_snapshot(bs: BusinessSettings) -> dict:
    return {
        "name": bs.legal_name, "legal_form": bs.legal_form, "capital": bs.capital, "rcs": bs.rcs,
        "address": bs.address, "postal_code": bs.postal_code, "city": bs.city,
        "siret": bs.siret, "siren": (bs.siret or "")[:9] or None,
        "vat_number": None if bs.vat_franchise else bs.vat_number,
        "email": bs.email, "phone": bs.phone, "iban": bs.iban, "bic": bs.bic,
    }


def buyer_snapshot(contact: Contact | None) -> dict:
    if contact is None:
        return {}
    is_pro = bool(contact.company or contact.siren)
    return {
        "name": contact.company if contact.company else contact.display_name,
        "contact_name": contact.display_name if contact.company else None,
        "address": contact.address, "email": contact.email, "phone": contact.phone,
        "siren": contact.siren, "vat_number": contact.vat_number, "professional": is_pro,
    }


def _seller_party(s: dict) -> Party:
    lines = [x for x in (s.get("address"), " ".join(p for p in (s.get("postal_code"), s.get("city")) if p)) if x]
    legal = " – ".join(x for x in (s.get("legal_form"),
                                   f"capital {s['capital']}" if s.get("capital") else None,
                                   s.get("rcs")) if x)
    if legal:
        lines.append(legal)
    if s.get("siret"):
        lines.append(f"SIRET {s['siret']}")
    if s.get("vat_number"):
        lines.append(f"TVA {s['vat_number']}")
    lines.append(" · ".join(x for x in (s.get("phone"), s.get("email")) if x))
    return Party(name=s.get("name") or "", lines=[x for x in lines if x])


def _buyer_party(b: dict) -> Party:
    lines = [x for x in (b.get("contact_name"), b.get("address"), b.get("email")) if x]
    if b.get("siren"):
        lines.append(f"SIREN {b['siren']}")
    if b.get("vat_number"):
        lines.append(f"TVA {b['vat_number']}")
    return Party(name=b.get("name") or "Client", lines=lines)


# ---------------------------------------------------------------------------
# Brouillons
# ---------------------------------------------------------------------------


def refresh_totals(inv: Invoice, bs: BusinessSettings) -> None:
    t = compute_totals(inv.lines, prices_include_vat=inv.prices_include_vat,
                       vat_franchise=bs.vat_franchise)
    inv.total_ht, inv.total_vat, inv.total_ttc = t.total_ht, t.total_vat, t.total_ttc


def invoice_from_quote(session: Session, quote: Quote, bs: BusinessSettings) -> Invoice:
    inv = Invoice(tenant_id=quote.tenant_id, contact=quote.contact, quote_id=quote.id,
                  title=quote.title, lines=list(quote.lines),
                  prices_include_vat=quote.prices_include_vat,
                  notes=f"Selon devis n° {quote.number}." if quote.number else None,
                  delivery_date=datetime.now(UTC))
    session.add(inv)
    refresh_totals(inv, bs)
    session.flush()
    return inv


def credit_note_for(session: Session, invoice: Invoice, bs: BusinessSettings,
                    lines: list[dict] | None = None) -> Invoice:
    """Avoir total (par défaut) ou partiel sur une facture émise."""
    if invoice.kind != "facture" or invoice.status in ("brouillon", "annulee"):
        raise InvoiceError("un avoir ne peut porter que sur une facture émise")
    note = Invoice(tenant_id=invoice.tenant_id, kind="avoir", contact=invoice.contact,
                   credited_invoice_id=invoice.id, title=f"Avoir sur la facture {invoice.number}",
                   lines=clean_lines(lines) if lines else list(invoice.lines),
                   prices_include_vat=invoice.prices_include_vat,
                   operation_category=invoice.operation_category,
                   delivery_date=invoice.delivery_date)
    session.add(note)
    refresh_totals(note, bs)
    if note.total_ttc > invoice.total_ttc - _credited(session, invoice):
        raise InvoiceError("l'avoir dépasse le montant restant de la facture")
    session.flush()
    return note


def _credited(session: Session, invoice: Invoice) -> Decimal:
    return sum((n.total_ttc for n in session.scalars(select(Invoice).where(
        Invoice.credited_invoice_id == invoice.id, Invoice.status != "brouillon"))),
        Decimal(0))


# ---------------------------------------------------------------------------
# Rendu et émission
# ---------------------------------------------------------------------------


def mentions(inv: Invoice, bs: BusinessSettings, seller: dict, buyer: dict) -> list[str]:
    out = [f"Nature de l'opération : {CATEGORIES.get(inv.operation_category, 'Livraison de biens')}."]
    if inv.kind == "facture":
        due = _aware(inv.due_date)
        issued = _aware(inv.issue_date) or datetime.now(UTC)
        if due and due.date() > issued.date():
            out.append(f"Paiement à réception, au plus tard le {due:%d/%m/%Y}.")
        else:
            out.append("Paiement à réception de la facture.")
        if buyer.get("professional"):
            out += [
                ("En cas de retard de paiement : pénalités au taux de trois fois le taux d'intérêt "
                "légal, et indemnité forfaitaire pour frais de recouvrement de 40 € "
                "(art. L441-10 du Code de commerce)."),
                "Pas d'escompte pour paiement anticipé.",
            ]
        if seller.get("iban"):
            out.append(f"Règlement par virement : IBAN {seller['iban']}"
                       + (f" – BIC {seller['bic']}" if seller.get("bic") else ""))
    if bs.vat_franchise:
        out.append("TVA non applicable, art. 293 B du CGI.")
    if bs.invoice_terms:
        out.append(bs.invoice_terms)
    return out


def _view(inv: Invoice, bs: BusinessSettings, seller: dict, buyer: dict,
          preceding: str | None) -> DocumentView:
    totals = compute_totals(inv.lines, prices_include_vat=inv.prices_include_vat,
                            vat_franchise=bs.vat_franchise)
    by_index = {lt.index: lt for lt in totals.lines}
    lines = [DocLine(description=ln["description"], detail=ln.get("detail"),
                     quantity=Decimal(ln["quantity"]), unit=ln.get("unit"),
                     unit_price=Decimal(ln["unit_price"]), vat_rate=by_index[i].vat_rate,
                     total=by_index[i].total)
             for i, ln in enumerate(inv.lines) if i in by_index]
    issued = (_aware(inv.issue_date) or datetime.now(UTC)).date()
    dates = []
    if inv.delivery_date:
        dates.append(("Date de la vente", f"{_aware(inv.delivery_date):%d/%m/%Y}"))
    if inv.kind == "facture" and inv.due_date:
        dates.append(("Échéance", f"{_aware(inv.due_date):%d/%m/%Y}"))
    if preceding:
        dates.append(("Facture d'origine", preceding))
    return DocumentView(
        kind=inv.kind, number=inv.number or "PROJET", issue_date=issued,
        seller=_seller_party(seller), client=_buyer_party(buyer), lines=lines, totals=totals,
        prices_include_vat=inv.prices_include_vat, title=inv.title or None, dates=dates,
        notes=inv.notes, mentions=mentions(inv, bs, seller, buyer), vat_franchise=bs.vat_franchise,
    )


def preview_pdf(session: Session, inv: Invoice, bs: BusinessSettings) -> bytes:
    if inv.pdf:  # émise : on renvoie toujours le document archivé, à l'identique
        return inv.pdf
    preceding = session.get(Invoice, inv.credited_invoice_id) if inv.credited_invoice_id else None
    return render_pdf(_view(inv, bs, seller_snapshot(bs), buyer_snapshot(inv.contact),
                            preceding.number if preceding else None))


def issue_invoice(session: Session, inv: Invoice, bs: BusinessSettings, now: datetime) -> None:
    if inv.status != "brouillon":
        raise InvoiceError("cette facture est déjà émise")
    missing = missing_for_documents(bs)
    if missing:
        raise InvoiceError("informations légales à compléter : " + ", ".join(missing))
    if inv.contact is None:
        raise InvoiceError("choisissez le client")
    if not inv.lines or any(ln.get("unit_price") is None for ln in inv.lines):
        raise InvoiceError("toutes les lignes doivent avoir un prix")
    refresh_totals(inv, bs)
    if inv.total_ttc <= 0:
        raise InvoiceError("le montant doit être positif")
    preceding = session.get(Invoice, inv.credited_invoice_id) if inv.credited_invoice_id else None
    if inv.kind == "avoir" and inv.total_ttc > preceding.total_ttc - _credited(session, preceding):
        raise InvoiceError("l'avoir dépasse le montant restant de la facture")

    inv.number = next_number(session, inv.tenant_id, "AV" if inv.kind == "avoir" else "FAC", now)
    inv.issue_date = now
    inv.delivery_date = inv.delivery_date or now
    inv.due_date = now + timedelta(days=bs.payment_terms_days) if inv.kind == "facture" else None
    inv.seller, inv.buyer = seller_snapshot(bs), buyer_snapshot(inv.contact)

    pdf = render_pdf(_view(inv, bs, inv.seller, inv.buyer, preceding.number if preceding else None))
    totals = compute_totals(inv.lines, prices_include_vat=inv.prices_include_vat,
                            vat_franchise=bs.vat_franchise)
    data = build_data_dict(
        kind=inv.kind, number=inv.number, issue_date=now.date(),
        due_date=inv.due_date.date() if inv.due_date else None,
        delivery_date=_aware(inv.delivery_date).date(),
        seller=inv.seller, buyer=inv.buyer, lines=inv.lines, totals=totals,
        prices_include_vat=inv.prices_include_vat, vat_franchise=bs.vat_franchise,
        payment_terms=mentions(inv, bs, inv.seller, inv.buyer)[1] if inv.kind == "facture" else "",
        iban=inv.seller.get("iban"), notes=[inv.notes] if inv.notes else [],
        preceding_number=preceding.number if preceding else None,
    )
    title = f"{'Avoir' if inv.kind == 'avoir' else 'Facture'} {inv.number}"
    inv.pdf = embed(pdf, generate_xml(data), title=title, author=inv.seller.get("name") or "")
    inv.status = "emise"

    if inv.quote_id:
        quote = session.get(Quote, inv.quote_id)
        if quote:
            quote.status = "facture"
    if preceding is not None and _credited(session, preceding) + inv.total_ttc >= preceding.total_ttc:
        preceding.status = "annulee"  # entièrement annulée par avoir(s)
    add_interaction(session, inv.contact, tenant_id=inv.tenant_id, channel="note",
                    direction="sortant", intent=inv.kind,
                    title=f"{title} émise ({fmt_money(inv.total_ttc)} TTC)", summary=inv.title,
                    data={"invoice_id": inv.id})


# ---------------------------------------------------------------------------
# Paiements et retards
# ---------------------------------------------------------------------------

METHODS = {"virement", "carte", "especes", "cheque"}


def record_payment(session: Session, inv: Invoice, amount: Decimal, *, method: str,
                   paid_on: datetime, by: str, note: str | None = None) -> Payment:
    if inv.kind != "facture" or inv.status not in UNPAID:
        raise InvoiceError("cette facture n'attend pas de paiement")
    if method not in METHODS:
        raise InvoiceError("moyen de paiement inconnu")
    amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    remaining = inv.total_ttc - inv.amount_paid - _credited(session, inv)
    if amount <= 0 or amount > remaining:
        raise InvoiceError(f"montant invalide (reste à payer : {fmt_money(remaining)})")
    payment = Payment(tenant_id=inv.tenant_id, invoice=inv, amount=amount, method=method,
                      paid_on=paid_on, note=note, recorded_by=by)
    session.add(payment)
    inv.amount_paid += amount
    inv.status = "payee" if amount == remaining else "partiellement_payee"
    session.flush()
    return payment


def is_overdue(inv: Invoice, now: datetime) -> bool:
    due = _aware(inv.due_date)
    return inv.status in UNPAID and due is not None and now.date() > due.date()


def remaining_due(session: Session, inv: Invoice) -> Decimal:
    return inv.total_ttc - inv.amount_paid - _credited(session, inv)


# ---------------------------------------------------------------------------
# Envoi par e-mail et relances
# ---------------------------------------------------------------------------


def default_email(inv: Invoice, bs: BusinessSettings) -> str:
    first = inv.contact.first_name if inv.contact and inv.contact.first_name else ""
    due = _aware(inv.due_date)
    when = f" avant le {due:%d/%m/%Y}" if due and inv.kind == "facture" else ""
    what = "notre avoir" if inv.kind == "avoir" else "notre facture"
    return (f"Bonjour{(' ' + first) if first else ''},\n\nVeuillez trouver ci-joint {what} "
            f"n° {inv.number} d'un montant de {fmt_money(inv.total_ttc)} TTC"
            f"{(', à régler' + when) if inv.kind == 'facture' else ''}.\n\n"
            f"Merci pour votre confiance.\n\nBien cordialement,\n{bs.legal_name or ''}\n"
            f"{bs.phone or ''}").strip()


async def send_invoice_email(session: Session, settings: Settings, tenant: TenantConfig,
                             inv: Invoice, body: str, *, subject_prefix: str = "") -> str:
    from ..mail.account import access_token, get_account
    from ..mail.gmail import GmailClient, build_new

    if inv.status == "brouillon":
        raise InvoiceError("émettez la facture avant de l'envoyer")
    if inv.contact is None or not inv.contact.email:
        raise InvoiceError("le client n'a pas d'adresse e-mail")
    account = get_account(session, tenant.id)
    if account is None:
        raise InvoiceError("aucune boîte Gmail connectée : téléchargez le PDF pour l'envoyer")
    label = "Avoir" if inv.kind == "avoir" else "Facture"
    gmail = GmailClient(await access_token(settings, account))
    try:
        sent_id = await gmail.send(build_new(
            to_email=inv.contact.email, to_name=inv.contact.display_name,
            from_email=account.email, from_name=tenant.profile.name,
            subject=f"{subject_prefix}{label} {inv.number} – {tenant.profile.name}",
            body=body, attachments=[(f"{label}-{inv.number}.pdf", inv.pdf, "application/pdf")]))
    finally:
        await gmail.aclose()
    inv.sent_at = inv.sent_at or datetime.now(UTC)
    add_interaction(session, inv.contact, tenant_id=tenant.id, channel="email",
                    direction="sortant", intent=inv.kind,
                    title=f"{subject_prefix or ''}{label} {inv.number} envoyée par e-mail",
                    summary=inv.title, body=body, external_id=sent_id,
                    data={"invoice_id": inv.id})
    return sent_id


def _tenant(settings: Settings, tenant_id: str) -> TenantConfig:
    from ..core.tenant_store import FileTenantStore

    tenant = FileTenantStore(settings.tenants_dir).get(tenant_id)
    if tenant is None:
        raise InvoiceError("commerce introuvable")
    return tenant


@executor("facture_emission")
async def run_invoice_approval(session: Session, approval: Approval, settings: Settings) -> str:
    """Validation proposée après un devis accepté : émet puis envoie si possible."""
    inv = session.get(Invoice, approval.payload["invoice_id"])
    if inv is None or inv.tenant_id != approval.tenant_id:
        raise InvoiceError("facture introuvable")
    tenant = _tenant(settings, approval.tenant_id)
    bs = business_settings(session, tenant)
    if inv.status == "brouillon":
        issue_invoice(session, inv, bs, datetime.now(UTC))
    body = str(approval.payload.get("email_body") or "") or default_email(inv, bs)
    try:
        await send_invoice_email(session, settings, tenant, inv, body)
        return f"facture {inv.number} émise et envoyée à {inv.contact.email}"
    except InvoiceError as exc:
        return f"facture {inv.number} émise (non envoyée : {exc})"


@executor("facture_relance")
async def run_invoice_reminder(session: Session, approval: Approval, settings: Settings) -> str:
    inv = session.get(Invoice, approval.payload["invoice_id"])
    if inv is None or inv.status not in UNPAID:
        return "relance inutile : la facture est réglée"
    tenant = _tenant(settings, approval.tenant_id)
    await send_invoice_email(session, settings, tenant, inv, str(approval.payload.get("body") or ""),
                             subject_prefix="Rappel – ")
    return f"relance envoyée à {inv.contact.email}"


def reminder_text(inv: Invoice, bs: BusinessSettings, remaining: Decimal) -> str:
    first = inv.contact.first_name if inv.contact and inv.contact.first_name else ""
    return (f"Bonjour{(' ' + first) if first else ''},\n\nSauf erreur de notre part, la facture "
            f"n° {inv.number} arrivée à échéance le {_aware(inv.due_date):%d/%m/%Y} reste à régler "
            f"({fmt_money(remaining)} TTC). Vous la trouverez à nouveau en pièce jointe.\n"
            "Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.\n\n"
            f"Bien cordialement,\n{bs.legal_name or ''}\n{bs.phone or ''}").strip()


async def schedule_invoice_reminders(session: Session, settings: Settings, tenant: TenantConfig,
                                     now: datetime) -> int:
    from ..crm.notify import request_approval

    bs = business_settings(session, tenant)
    created = 0
    for inv in session.scalars(select(Invoice).where(Invoice.tenant_id == tenant.id,
                                                     Invoice.kind == "facture",
                                                     Invoice.status.in_(UNPAID))):
        due = _aware(inv.due_date)
        if due is None or inv.reminders_sent >= len(REMINDER_DAYS_AFTER_DUE):
            continue
        if now < due + timedelta(days=REMINDER_DAYS_AFTER_DUE[inv.reminders_sent]):
            continue
        inv.reminders_sent += 1  # proposée une seule fois, même si refusée
        remaining = remaining_due(session, inv)
        await request_approval(
            session, settings, tenant, module=ModuleKey.INVOICES, kind="facture_relance",
            title=f"Relancer {inv.contact.display_name if inv.contact else 'le client'} — "
                  f"facture {inv.number} impayée",
            summary=f"Échue le {due:%d/%m}, reste {fmt_money(remaining)} TTC.",
            payload={"invoice_id": inv.id, "body": reminder_text(inv, bs, remaining)},
            contact=inv.contact,
        )
        created += 1
    return created


async def propose_invoice_for_quote(session: Session, settings: Settings, tenant: TenantConfig,
                                    quote: Quote) -> Invoice:
    """Devis accepté : l'assistant prépare la facture et la soumet à validation."""
    from ..crm.notify import request_approval

    bs = business_settings(session, tenant)
    inv = invoice_from_quote(session, quote, bs)
    await request_approval(
        session, settings, tenant, module=ModuleKey.INVOICES, kind="facture_emission",
        title=f"Facture à émettre — {quote.contact.display_name if quote.contact else 'client'}",
        summary=f"Devis {quote.number} accepté : facture de {fmt_money(inv.total_ttc)} TTC prête. "
                "Valider l'émet (numéro définitif) et l'envoie au client.",
        payload={"invoice_id": inv.id, "email_body": ""}, contact=quote.contact,
    )
    return inv
