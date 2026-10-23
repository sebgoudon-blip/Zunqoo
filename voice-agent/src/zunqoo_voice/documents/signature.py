"""Signature en ligne des devis, intégrée au CRM (sans service tiers).

Signature électronique « simple » au sens du règlement eIDAS (UE)
n° 910/2014 et des articles 1366-1367 du Code civil : sa valeur repose sur
le dossier de preuve, conservé sans limite de durée avec le devis :

- le PDF exact présenté au client, figé à l'envoi, et son empreinte SHA-256 ;
- l'identité déclarée (nom, qualité) et l'adresse e-mail vérifiée par un
  code à 6 chiffres envoyé depuis la boîte du commerce ;
- l'image de la signature tracée, la date et l'heure, l'adresse IP et le
  navigateur ;
- le journal horodaté de chaque étape (envoi, consultation, code, signature) ;
- un PDF signé : le devis suivi d'un certificat de signature, lui-même
  empreinté (SHA-256), envoyé au client et gardé par le commerce.

Le lien de signature est un identifiant aléatoire suivi d'une empreinte
HMAC (clé SESSION_SECRET) : impossible à deviner, recalculable par le CRM.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import logging
import secrets
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.models import TenantConfig
from ..crm.db import BusinessSettings, Quote, QuoteSignature
from . import pdf as pdf_mod
from .pdf import fmt_money
from .quotes import business_settings, quote_pdf, record_decision

log = logging.getLogger(__name__)

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
OTP_MAX_SENDS = 5
MAX_SIGNATURE_BYTES = 300_000
MAX_EVENTS = 200


class SignatureError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def _aware(d: datetime | None) -> datetime | None:
    return None if d is None else (d if d.tzinfo else d.replace(tzinfo=UTC))


# --- lien -----------------------------------------------------------------------


def _tag(settings: Settings, sig_id: str) -> str:
    key = settings.session_secret.get_secret_value().encode()
    return hmac.new(key, f"signature:{sig_id}".encode(), hashlib.sha256).hexdigest()[:24]


def sign_token(settings: Settings, sig: QuoteSignature) -> str:
    return f"{sig.id}-{_tag(settings, sig.id)}"


def sign_url(settings: Settings, sig: QuoteSignature) -> str:
    return f"{settings.crm_public_url.rstrip('/')}/signer/{sign_token(settings, sig)}"


def find_by_token(session: Session, settings: Settings, token: str) -> QuoteSignature:
    sig_id, _, tag = token.partition("-")
    if not (sig_id and tag and hmac.compare_digest(tag, _tag(settings, sig_id))):
        raise SignatureError("lien de signature invalide", 404)
    sig = session.get(QuoteSignature, sig_id)
    if sig is None:
        raise SignatureError("lien de signature invalide", 404)
    return sig


def log_event(sig: QuoteSignature, event: str, ip: str | None = None, **extra) -> None:
    entry = {"at": datetime.now(UTC).isoformat(), "event": event, **({"ip": ip} if ip else {}),
             **extra}
    sig.events = [*(sig.events or [])[-(MAX_EVENTS - 1):], entry]  # nouvelle liste (suivi JSON)


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    user, domain = email.split("@", 1)
    return f"{user[0]}{'•' * max(2, min(len(user) - 1, 6))}@{domain}"


# --- ouverture ------------------------------------------------------------------


def current_signature(session: Session, quote: Quote) -> QuoteSignature | None:
    return session.scalar(select(QuoteSignature).where(QuoteSignature.quote_id == quote.id)
                          .order_by(QuoteSignature.created_at.desc()).limit(1))


def open_signature(session: Session, quote: Quote, bs: BusinessSettings,
                   *, document: bytes | None = None, by: str = "envoi") -> QuoteSignature:
    """Lien de signature du devis émis (réutilisé tant qu'il est ouvert).

    Le PDF est figé ici : c'est exactement ce document que le client lit et
    signe, et celui joint à l'e-mail."""
    if quote.number is None:
        raise SignatureError("le devis doit être émis avant d'être signé")
    sig = current_signature(session, quote)
    if sig is not None and sig.status in ("ouvert", "signe"):
        return sig
    from ..mail.account import get_account

    document = document or quote_pdf(quote, bs)
    expires = None
    if quote.valid_until:
        expires = datetime.combine(_aware(quote.valid_until).date(), time(23, 59, 59), UTC)
    sig = QuoteSignature(
        tenant_id=quote.tenant_id, quote=quote, document_pdf=document,
        document_sha256=hashlib.sha256(document).hexdigest(), expires_at=expires,
        signer_email=quote.contact.email if quote.contact else None,
        otp_required=bool(quote.contact and quote.contact.email
                          and get_account(session, quote.tenant_id) is not None),
        events=[])
    session.add(sig)
    log_event(sig, "lien_cree", by=by)
    session.flush()
    return sig


def ensure_open(sig: QuoteSignature, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    if sig.status == "signe":
        raise SignatureError("ce devis est déjà signé", 409)
    if sig.status == "refuse":
        raise SignatureError("ce devis a été refusé", 409)
    if sig.status != "ouvert" or sig.quote.status not in ("envoye",):
        raise SignatureError("ce devis n'est plus ouvert à la signature : contactez le commerce", 410)
    if sig.expires_at and now > _aware(sig.expires_at):
        raise SignatureError("ce devis a expiré : contactez le commerce pour un nouveau devis", 410)


# --- code par e-mail --------------------------------------------------------------


def _otp_hash(settings: Settings, sig: QuoteSignature, code: str) -> str:
    key = settings.session_secret.get_secret_value().encode()
    return hmac.new(key, f"otp:{sig.id}:{code}".encode(), hashlib.sha256).hexdigest()


async def send_code(session: Session, settings: Settings, tenant: TenantConfig,
                    sig: QuoteSignature, ip: str | None) -> None:
    from ..mail.account import access_token, get_account
    from ..mail.gmail import GmailClient, build_new

    ensure_open(sig)
    if not sig.otp_required:
        raise SignatureError("aucun code n'est nécessaire pour ce devis")
    if sig.otp_sent_count >= OTP_MAX_SENDS:
        raise SignatureError("trop de codes demandés : contactez le commerce", 429)
    account = get_account(session, sig.tenant_id)
    if account is None or not sig.signer_email:
        raise SignatureError("envoi du code impossible : contactez le commerce", 503)
    code = f"{secrets.randbelow(1_000_000):06d}"
    gmail = GmailClient(await access_token(settings, account))
    try:
        await gmail.send(build_new(
            to_email=sig.signer_email, to_name=sig.quote.contact.display_name
            if sig.quote.contact else "", from_email=account.email,
            from_name=tenant.profile.name,
            subject=f"Votre code de signature : {code}",
            body=(f"Bonjour,\n\nVoici votre code pour signer le devis n° {sig.quote.number} "
                  f"de {tenant.profile.name} :\n\n    {code}\n\nIl est valable 10 minutes. "
                  "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\n"
                  f"{tenant.profile.name}")))
    finally:
        await gmail.aclose()
    sig.otp_hash = _otp_hash(settings, sig, code)
    sig.otp_expires_at = datetime.now(UTC) + OTP_TTL
    sig.otp_attempts = 0
    sig.otp_sent_count += 1
    log_event(sig, "code_envoye", ip, to=mask_email(sig.signer_email))


def verify_code(settings: Settings, sig: QuoteSignature, code: str, ip: str | None) -> None:
    ensure_open(sig)
    if sig.otp_verified_at:
        return
    if not sig.otp_hash or not sig.otp_expires_at or datetime.now(UTC) > _aware(sig.otp_expires_at):
        raise SignatureError("code expiré : demandez-en un nouveau")
    if sig.otp_attempts >= OTP_MAX_ATTEMPTS:
        raise SignatureError("trop d'essais : demandez un nouveau code", 429)
    sig.otp_attempts += 1
    if not hmac.compare_digest(sig.otp_hash, _otp_hash(settings, sig, code.strip())):
        log_event(sig, "code_errone", ip)
        raise SignatureError("code incorrect")
    sig.otp_verified_at = datetime.now(UTC)
    sig.otp_hash = None
    log_event(sig, "code_verifie", ip, email=sig.signer_email)


# --- signature --------------------------------------------------------------------


def decode_signature(data_url: str) -> bytes:
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise SignatureError("signature illisible")
    try:
        png = base64.b64decode(data_url[len(prefix):], validate=True)
    except ValueError as exc:
        raise SignatureError("signature illisible") from exc
    if not png.startswith(b"\x89PNG\r\n\x1a\n") or not 500 < len(png) <= MAX_SIGNATURE_BYTES:
        raise SignatureError("signature illisible ou vide")
    return png


async def sign(session: Session, settings: Settings, tenant: TenantConfig, sig: QuoteSignature,
               *, name: str, role: str | None, signature_png: str, ip: str | None,
               user_agent: str | None) -> QuoteSignature:
    ensure_open(sig)
    if sig.otp_required and not sig.otp_verified_at:
        raise SignatureError("vérifiez d'abord votre adresse e-mail avec le code reçu")
    name = " ".join(name.split())
    if len(name) < 3:
        raise SignatureError("indiquez votre nom et prénom")
    sig.signature_png = decode_signature(signature_png)
    sig.signer_name, sig.signer_role = name[:200], (role or "").strip()[:200] or None
    sig.signed_at = datetime.now(UTC)
    sig.signer_ip, sig.signer_user_agent = ip, (user_agent or "")[:400] or None
    sig.status = "signe"
    log_event(sig, "signe", ip, name=sig.signer_name)
    bs = business_settings(session, tenant)
    sig.signed_pdf = signed_pdf(sig, tenant, bs)
    sig.signed_pdf_sha256 = hashlib.sha256(sig.signed_pdf).hexdigest()
    quote = sig.quote
    await record_decision(session, settings, tenant, quote, "accepte", by=sig.signer_name,
                          channel="signature",
                          title=f"Devis {quote.number} signé en ligne par {sig.signer_name} "
                                f"({fmt_money(quote.total_ttc)} TTC)",
                          data={"signature_id": sig.id})
    await _after_decision(session, settings, tenant, sig, accepted=True)
    return sig


async def refuse(session: Session, settings: Settings, tenant: TenantConfig, sig: QuoteSignature,
                 *, reason: str | None, ip: str | None, user_agent: str | None) -> QuoteSignature:
    ensure_open(sig)
    sig.status = "refuse"
    sig.refusal_reason = (reason or "").strip()[:2000] or None
    sig.signer_ip, sig.signer_user_agent = ip, (user_agent or "")[:400] or None
    log_event(sig, "refuse", ip)
    quote = sig.quote
    await record_decision(session, settings, tenant, quote, "refuse", by="client",
                          channel="signature",
                          title=f"Devis {quote.number} refusé en ligne"
                                + (f" : « {sig.refusal_reason[:120]} »" if sig.refusal_reason else ""),
                          data={"signature_id": sig.id})
    await _after_decision(session, settings, tenant, sig, accepted=False)
    return sig


async def _after_decision(session: Session, settings: Settings, tenant: TenantConfig,
                          sig: QuoteSignature, *, accepted: bool) -> None:
    """Prévient le gérant (WhatsApp) et, si signé, envoie au client son exemplaire."""
    quote = sig.quote
    who = sig.signer_name or (quote.contact.display_name if quote.contact else "le client")
    text = (f"✍️ *Devis {quote.number} signé en ligne* par {who} — {fmt_money(quote.total_ttc)} TTC"
            if accepted else
            f"❌ *Devis {quote.number} refusé en ligne* par {who}"
            + (f"\nMotif : {sig.refusal_reason}" if sig.refusal_reason else ""))
    text += f"\n{settings.crm_public_url.rstrip('/')}/devis/{quote.id}"
    try:
        from ..whatsapp.client import WhatsAppClient
        from ..whatsapp.notifier import credentials_for

        if tenant.whatsapp.manager_numbers:
            client = WhatsAppClient(credentials_for(tenant, settings))
            try:
                for to in tenant.whatsapp.manager_numbers:
                    await client.send_text(to, text)
            finally:
                await client.aclose()
    except Exception:  # noqa: BLE001 - la décision est enregistrée, l'alerte est un bonus
        log.warning("alerte WhatsApp de signature non envoyée (hors fenêtre de 24 h ?)")
    if accepted and sig.signer_email:
        try:
            await _send_signed_copy(session, settings, tenant, sig)
        except Exception:
            log.exception("copie signée du devis %s non envoyée", quote.number)


async def _send_signed_copy(session: Session, settings: Settings, tenant: TenantConfig,
                            sig: QuoteSignature) -> None:
    from ..mail.account import access_token, get_account
    from ..mail.gmail import GmailClient, build_new

    account = get_account(session, sig.tenant_id)
    if account is None:
        return
    quote = sig.quote
    gmail = GmailClient(await access_token(settings, account))
    try:
        await gmail.send(build_new(
            to_email=sig.signer_email, to_name=sig.signer_name or "", from_email=account.email,
            from_name=tenant.profile.name,
            subject=f"Devis {quote.number} signé – {tenant.profile.name}",
            body=(f"Bonjour,\n\nMerci ! Nous avons bien reçu votre accord pour le devis "
                  f"n° {quote.number} « {quote.title} » ({fmt_money(quote.total_ttc)} TTC).\n"
                  "Vous trouverez ci-joint votre exemplaire signé, avec son certificat de "
                  f"signature.\n\nÀ très bientôt,\n{tenant.profile.name}"),
            attachments=[(f"Devis-{quote.number}-signe.pdf", sig.signed_pdf, "application/pdf")]))
    finally:
        await gmail.aclose()
    log_event(sig, "copie_envoyee", to=mask_email(sig.signer_email))


# --- PDF signé et certificat ---------------------------------------------------------

EVENT_LABEL = {
    "lien_cree": "Devis émis et lien de signature créé",
    "consulte": "Devis consulté par le client",
    "code_envoye": "Code de vérification envoyé par e-mail",
    "code_errone": "Code de vérification erroné",
    "code_verifie": "Adresse e-mail vérifiée par code",
    "signe": "Devis signé",
    "refuse": "Devis refusé",
    "copie_envoyee": "Exemplaire signé envoyé au client",
}


def _local(d: datetime, tz: str) -> str:
    return f"{_aware(d).astimezone(ZoneInfo(tz)):%d/%m/%Y à %H:%M:%S} (heure de Paris)" \
        if tz == "Europe/Paris" else f"{_aware(d).astimezone(ZoneInfo(tz)):%d/%m/%Y %H:%M:%S %Z}"


def accepted_mention(quote: Quote) -> str:
    """Texte que le client coche avant de signer (repris tel quel au certificat)."""
    return (f"Bon pour accord. J'accepte le devis n° {quote.number} d'un montant de "
            f"{fmt_money(quote.total_ttc)} TTC et ses conditions.")


def certificate_pdf(sig: QuoteSignature, tenant: TenantConfig, bs: BusinessSettings) -> bytes:
    pdf_mod._register_fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"Certificat de signature – devis {sig.quote.number}")
    base = ParagraphStyle("b", fontName="DejaVu", fontSize=9, leading=12.5)
    small = ParagraphStyle("s", parent=base, fontSize=7.5, leading=10, textColor=pdf_mod.MUTED)
    bold = ParagraphStyle("bd", parent=base, fontName="DejaVu-Bold")
    title = ParagraphStyle("t", parent=bold, fontSize=15, leading=19, textColor=pdf_mod.ACCENT)
    h2 = ParagraphStyle("h2", parent=bold, fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=4)
    q = sig.quote
    tz = tenant.timezone

    def esc(text: str) -> str:
        return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def kv(rows: list[tuple[str, str]]) -> Table:
        t = Table([[Paragraph(k, small), Paragraph(esc(v), base)] for k, v in rows],
                  colWidths=[48 * mm, None])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LINEBELOW", (0, 0), (-1, -1), 0.4, pdf_mod.LINE),
                               ("TOPPADDING", (0, 0), (-1, -1), 4),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        return t

    story = [Paragraph("Certificat de signature électronique", title),
             Paragraph(f"{esc(bs.legal_name or tenant.profile.name)} — devis n° {esc(q.number)}", bold),
             Spacer(1, 5 * mm),
             Paragraph("Document signé", h2),
             kv([("Devis", f"n° {q.number} — {q.title}"),
                 ("Montant", f"{fmt_money(q.total_ttc)} TTC"),
                 ("Émis par", bs.legal_name or tenant.profile.name),
                 ("Empreinte SHA-256 du devis", sig.document_sha256)]),
             Paragraph("Signataire", h2),
             kv([("Nom", sig.signer_name or ""),
                 *([("Qualité", sig.signer_role)] if sig.signer_role else []),
                 ("E-mail", (sig.signer_email or "—")
                  + (" (vérifié par code)" if sig.otp_verified_at else " (non vérifié)")),
                 ("Date de signature", _local(sig.signed_at, tz)),
                 ("Adresse IP", sig.signer_ip or "—"),
                 ("Navigateur", sig.signer_user_agent or "—"),
                 ("Mention acceptée", accepted_mention(q))])]
    if sig.signature_png:
        img = Image(io.BytesIO(sig.signature_png))
        ratio = img.imageHeight / img.imageWidth if img.imageWidth else 0.4
        img.drawWidth, img.drawHeight = 70 * mm, 70 * mm * ratio
        box = Table([[Paragraph("Signature", small)], [img]], colWidths=[80 * mm])
        box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, pdf_mod.LINE),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
        story += [Spacer(1, 4 * mm), box]
    story += [Paragraph("Journal", h2),
              kv([(_local(datetime.fromisoformat(e["at"]), tz).replace(" (heure de Paris)", ""),
                   EVENT_LABEL.get(e["event"], e["event"])
                   + (f" — IP {e['ip']}" if e.get("ip") else ""))
                  for e in sig.events if e["event"] in EVENT_LABEL]),
              Spacer(1, 6 * mm),
              Paragraph(
                  "Signature électronique simple au sens du règlement (UE) n° 910/2014 (eIDAS) et "
                  "des articles 1366 et 1367 du Code civil. Le devis signé correspond exactement au "
                  "document dont l'empreinte figure ci-dessus ; toute modification la changerait. "
                  f"Dossier de preuve conservé par {esc(bs.legal_name or tenant.profile.name)} "
                  f"(référence {sig.id}). Généré par Zunqoo.", small)]
    doc.build(story)
    return buf.getvalue()


def signed_pdf(sig: QuoteSignature, tenant: TenantConfig, bs: BusinessSettings) -> bytes:
    """Le devis tel que présenté au client, suivi du certificat de signature."""
    writer = PdfWriter()
    for part in (sig.document_pdf, certificate_pdf(sig, tenant, bs)):
        for page in PdfReader(io.BytesIO(part)).pages:
            writer.add_page(page)
    writer.add_metadata({"/Title": f"Devis {sig.quote.number} signé",
                         "/Author": bs.legal_name or tenant.profile.name,
                         "/Subject": f"Signé par {sig.signer_name} le "
                                     f"{_aware(sig.signed_at):%Y-%m-%d %H:%M:%S} UTC"})
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def signature_out(settings: Settings, sig: QuoteSignature | None) -> dict | None:
    """Vue CRM (gérant)."""
    if sig is None:
        return None
    return {"id": sig.id, "status": sig.status, "url": sign_url(settings, sig)
            if sig.status == "ouvert" else None,
            "created_at": _aware(sig.created_at).isoformat(),
            "expires_at": _aware(sig.expires_at).isoformat() if sig.expires_at else None,
            "otp_required": sig.otp_required,
            "signer_name": sig.signer_name, "signer_role": sig.signer_role,
            "signer_email": sig.signer_email if sig.otp_verified_at else None,
            "signed_at": _aware(sig.signed_at).isoformat() if sig.signed_at else None,
            "signer_ip": sig.signer_ip, "refusal_reason": sig.refusal_reason,
            "document_sha256": sig.document_sha256, "signed_pdf_sha256": sig.signed_pdf_sha256,
            "viewed": any(e["event"] == "consulte" for e in sig.events or []),
            "events": [{"at": e["at"], "label": EVENT_LABEL.get(e["event"], e["event"]),
                        "ip": e.get("ip")} for e in sig.events or []]}
