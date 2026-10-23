"""Demandes d'avis Google après une commande, un rendez-vous ou une facture réglée.

Règles :
- chaque client reçoit au plus une demande tous les 6 mois ;
- la demande part par e-mail (Gmail du commerce), après le délai choisi ;
- tout le monde est sollicité de la même façon : Google interdit de ne
  solliciter que les clients satisfaits ou de filtrer les avis négatifs, et
  d'offrir une contrepartie (réduction, cadeau) ;
- un client étiqueté « pas_d_avis » n'est jamais sollicité ;
- pour les clients sans e-mail (souvent ceux du téléphone), l'affiche avec
  QR code à poser au comptoir prend le relais.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.approvals import ApprovalBlocked, executor, on_refuse
from ..crm.db import Appointment, Approval, Contact, Interaction, Invoice, ReviewRequest
from ..crm.modules import Autonomy, ModuleKey
from ..crm.services import add_interaction, enabled_modules, get_modules
from ..documents import pdf as pdf_mod
from .summary import extras_settings

log = logging.getLogger(__name__)

OPT_OUT_TAG = "pas_d_avis"
COOLDOWN = timedelta(days=180)
LOOKBACK = timedelta(days=14)   # au-delà, trop tard pour demander un avis
MAX_PER_RUN = 10                # évite d'inonder la file « À valider »


class ReviewError(ApprovalBlocked):
    pass


def _aware(d: datetime | None) -> datetime | None:
    return None if d is None else (d if d.tzinfo else d.replace(tzinfo=UTC))


def default_message(tenant: TenantConfig) -> str:
    return ("Bonjour {prenom},\n\n"
            f"Merci pour votre confiance ! Si vous avez deux minutes, votre avis sur Google "
            f"aiderait beaucoup {tenant.profile.name} à se faire connaître :\n{{lien}}\n\n"
            "Et s'il y a quoi que ce soit à améliorer, répondez simplement à cet e-mail, "
            f"nous lisons tout.\n\nÀ bientôt,\n{tenant.profile.name}")


def render_message(template: str, contact: Contact | None, link: str) -> str:
    first = (contact.first_name or "").strip() if contact else ""
    text = template.replace("{lien}", link).replace("{prenom}", first)
    return text.replace("Bonjour ,", "Bonjour,").strip()


@dataclass
class Candidate:
    source: str
    source_id: str
    contact: Contact | None
    happened_at: datetime


def _candidates(session: Session, tenant_id: str, modules: set[ModuleKey],
                since: datetime, until: datetime) -> list[Candidate]:
    out: list[Candidate] = []
    if ModuleKey.ORDERS in modules:
        # Commande téléphonique marquée « faite » dans Ma journée.
        for i in session.scalars(select(Interaction).where(
                Interaction.tenant_id == tenant_id, Interaction.channel == "appel",
                Interaction.intent == "commande", Interaction.occurred_at >= since - LOOKBACK)):
            done = (i.data or {}).get("handled_at")
            if done:
                at = _aware(datetime.fromisoformat(done))
                if since <= at <= until:
                    out.append(Candidate("commande", i.id, i.contact, at))
    if ModuleKey.APPOINTMENTS in modules:
        for a in session.scalars(select(Appointment).where(
                Appointment.tenant_id == tenant_id, Appointment.status == "confirme",
                Appointment.end >= since, Appointment.end <= until)):
            out.append(Candidate("rendez_vous", a.id, a.contact, _aware(a.end)))
    if ModuleKey.INVOICES in modules:
        for inv in session.scalars(select(Invoice).where(
                Invoice.tenant_id == tenant_id, Invoice.kind == "facture",
                Invoice.status == "payee")):
            paid = max((_aware(p.paid_on) for p in inv.payments), default=None)
            if paid and since <= paid <= until:
                out.append(Candidate("facture", inv.id, inv.contact, paid))
    return sorted(out, key=lambda c: c.happened_at)


def _recently_asked(session: Session, contact: Contact, now: datetime) -> bool:
    return session.scalar(select(ReviewRequest.id).where(
        ReviewRequest.contact_id == contact.id,
        ReviewRequest.status.in_(("a_valider", "envoye")),
        ReviewRequest.created_at >= now - COOLDOWN).limit(1)) is not None


async def schedule_review_requests(session: Session, settings: Settings, tenant: TenantConfig,
                                   now: datetime) -> int:
    """Crée les demandes dues ; envoie ou soumet à validation selon l'autonomie."""
    from ..crm.notify import request_approval
    from ..mail.account import get_account

    states = get_modules(session, tenant.id)
    if not states[ModuleKey.REVIEWS].enabled:
        return 0
    cfg = extras_settings(session, tenant.id)
    if not cfg.review_link or get_account(session, tenant.id) is None:
        return 0
    modules = enabled_modules(session, tenant.id)
    delay = timedelta(hours=cfg.review_delay_hours)
    until = now - delay
    known = {(s, i) for s, i in session.execute(select(ReviewRequest.source, ReviewRequest.source_id)
                                                .where(ReviewRequest.tenant_id == tenant.id))}
    handled = 0
    for c in _candidates(session, tenant.id, modules, until - LOOKBACK, until):
        if handled >= MAX_PER_RUN:
            break
        if (c.source, c.source_id) in known:
            continue
        known.add((c.source, c.source_id))
        req = ReviewRequest(tenant_id=tenant.id, contact=c.contact, source=c.source,
                            source_id=c.source_id, status="sans_email")
        session.add(req)
        if c.contact is None or not c.contact.email or OPT_OUT_TAG in (c.contact.tags or []):
            session.flush()
            continue
        if _recently_asked(session, c.contact, now):
            req.status = "deja_demande"
            session.flush()
            continue
        body = render_message(cfg.review_message or default_message(tenant), c.contact,
                              cfg.review_link)
        handled += 1
        if states[ModuleKey.REVIEWS].autonomy == Autonomy.VALIDATE_ALL:
            req.status = "a_valider"
            session.flush()
            await request_approval(
                session, settings, tenant, module=ModuleKey.REVIEWS, kind="avis_demande",
                title=f"Demander un avis Google à {c.contact.display_name}",
                summary=f"Après {_SOURCE_LABEL[c.source]}. E-mail à {c.contact.email}.",
                payload={"review_id": req.id, "body": body}, contact=c.contact)
        else:
            session.flush()
            try:
                await send_review_email(session, settings, tenant, req, body)
            except Exception:
                req.status = "echec"
                log.exception("demande d'avis %s non envoyée", req.id)
    return handled


_SOURCE_LABEL = {"commande": "sa commande", "rendez_vous": "son rendez-vous",
                 "facture": "le règlement de sa facture"}


async def send_review_email(session: Session, settings: Settings, tenant: TenantConfig,
                            req: ReviewRequest, body: str) -> None:
    from ..mail.account import access_token, get_account
    from ..mail.gmail import GmailClient, build_new

    contact = req.contact
    if contact is None or not contact.email:
        raise ReviewError("le client n'a pas d'adresse e-mail")
    account = get_account(session, tenant.id)
    if account is None:
        raise ReviewError("aucune boîte Gmail connectée")
    subject = f"Votre avis compte pour {tenant.profile.name}"
    gmail = GmailClient(await access_token(settings, account))
    try:
        sent_id = await gmail.send(build_new(
            to_email=contact.email, to_name=contact.display_name, from_email=account.email,
            from_name=tenant.profile.name, subject=subject, body=body))
    finally:
        await gmail.aclose()
    req.status, req.sent_at = "envoye", datetime.now(UTC)
    add_interaction(session, contact, tenant_id=tenant.id, channel="email", direction="sortant",
                    intent="avis", title="Demande d'avis Google envoyée", summary=body[:300],
                    body=body, external_id=sent_id, data={"review_id": req.id})


def _tenant(settings: Settings, tenant_id: str) -> TenantConfig:
    from ..core.tenant_store import FileTenantStore

    tenant = FileTenantStore(settings.tenants_dir).get(tenant_id)
    if tenant is None:
        raise ReviewError("commerce introuvable")
    return tenant


@executor("avis_demande", editable=("body",))
async def run_review_approval(session: Session, approval: Approval, settings: Settings) -> str:
    req = session.get(ReviewRequest, approval.payload["review_id"])
    if req is None or req.tenant_id != approval.tenant_id:
        raise ReviewError("demande introuvable")
    if req.status == "envoye":
        return "demande d'avis déjà envoyée"
    await send_review_email(session, settings, _tenant(settings, approval.tenant_id), req,
                            str(approval.payload.get("body") or ""))
    return f"demande d'avis envoyée à {req.contact.email}"


@on_refuse("avis_demande")
async def refuse_review(session: Session, approval: Approval, settings: Settings) -> str:
    req = session.get(ReviewRequest, approval.payload.get("review_id"))
    if req is not None and req.status == "a_valider":
        req.status = "refuse"
    return "aucune demande d'avis envoyée"


def review_stats(session: Session, tenant_id: str, now: datetime) -> dict:
    rows = list(session.scalars(select(ReviewRequest).where(
        ReviewRequest.tenant_id == tenant_id,
        ReviewRequest.created_at >= now - timedelta(days=30))))
    count = {s: sum(1 for r in rows if r.status == s)
             for s in ("envoye", "a_valider", "refuse", "sans_email", "deja_demande", "echec")}
    return {"last_30_days": count}


def poster_pdf(tenant: TenantConfig, link: str) -> bytes:
    """Affiche A5 « Laissez-nous un avis » avec QR code, à poser au comptoir."""
    pdf_mod._register_fonts()
    buf = io.BytesIO()
    w, h = A5
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"Avis Google – {tenant.profile.name}")
    c.setFillColor(pdf_mod.ACCENT)
    c.setFont("DejaVu-Bold", 22)
    c.drawCentredString(w / 2, h - 32 * mm, "Vous avez aimé ?")
    c.setFillColorRGB(0.13, 0.1, 0.08)
    c.setFont("DejaVu", 15)
    c.drawCentredString(w / 2, h - 42 * mm, "Laissez-nous un avis sur Google")
    size = 80 * mm
    widget = qr.QrCodeWidget(link, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    d = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    d.add(widget)
    renderPDF.draw(d, c, (w - size) / 2, h / 2 - size / 2 - 8 * mm)
    c.setFont("DejaVu", 11)
    c.setFillColor(pdf_mod.MUTED)
    c.drawCentredString(w / 2, 40 * mm, "Scannez avec l'appareil photo de votre téléphone")
    c.setFont("DejaVu-Bold", 16)
    c.setFillColorRGB(0.13, 0.1, 0.08)
    c.drawCentredString(w / 2, 26 * mm, tenant.profile.name)
    c.setFont("DejaVu", 13)
    c.setFillColor(pdf_mod.ACCENT)
    c.drawCentredString(w / 2, 18 * mm, "Merci !")
    c.showPage()
    c.save()
    return buf.getvalue()
