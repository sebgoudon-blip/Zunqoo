"""Relève et traitement des e-mails d'un commerce.

Pour chaque nouvel e-mail de la boîte de réception :
1. dédoublonnage (table ``mail_messages``) ;
2. newsletters et « no-reply » écartés sans appel LLM ;
3. tri, fiche client, entrée dans l'historique ;
4. si une réponse est attendue : rédaction, puis envoi automatique ou
   validation selon l'autonomie choisie ;
5. libellé « Zunqoo » posé dans Gmail (le gérant voit ce qui a été traité).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agenda.service import AgendaError, book
from ..core.config import Settings
from ..core.models import TenantConfig
from ..core.structured_llm import StructuredLLM
from ..crm.approvals import executor
from ..crm.db import Approval, MailMessage, session_scope
from ..crm.modules import Autonomy, ModuleKey
from ..crm.notify import request_approval
from ..crm.services import (
    add_interaction,
    catalog_as_products,
    find_or_create_contact,
    get_modules,
    list_catalog,
)
from ..documents.quotes import (
    QuoteError,
    business_settings,
    draft_quote,
    missing_for_documents,
    quote_from_draft,
    quote_summary,
    refresh_totals,
    send_quote_email,
)
from .account import access_token, get_account
from .appointments import plan_appointment
from .gmail import GmailClient, InboundMail, build_reply
from .triage import CATEGORY_LABEL, decide_action, draft_reply, triage_mail

log = logging.getLogger(__name__)

@dataclass
class SyncResult:
    seen: int = 0
    ignored: int = 0
    filed: int = 0
    auto_sent: int = 0
    to_validate: int = 0
    errors: list[str] = field(default_factory=list)


async def _send(gmail: GmailClient, from_email: str, tenant: TenantConfig,
                mail: InboundMail, body: str) -> str:
    return await gmail.send(build_reply(mail, from_email=from_email,
                                        from_name=tenant.profile.name, body=body))


async def sync_tenant(settings: Settings, tenant: TenantConfig, *,
                      llm: StructuredLLM | None = None,
                      gmail: GmailClient | None = None) -> SyncResult:
    result = SyncResult()
    with session_scope(settings.database_url) as session:
        modules = get_modules(session, tenant.id)
        account = get_account(session, tenant.id)
        if account is None or not modules[ModuleKey.EMAIL].enabled:
            return result
        if account.scopes and "gmail.modify" not in account.scopes:
            return result  # compte Google connecté pour l'agenda seulement
        autonomy = modules[ModuleKey.EMAIL].autonomy
        quotes_autonomy = modules[ModuleKey.QUOTES].autonomy
        appointments_autonomy = modules[ModuleKey.APPOINTMENTS].autonomy
        enabled = {k for k, s in modules.items() if s.enabled}
        products = catalog_as_products(list_catalog(session, tenant.id, only_active=True)) \
            or tenant.profile.products
        own_client = gmail is None
        try:
            gmail = gmail or GmailClient(await access_token(settings, account))
            if not account.label_id:
                account.label_id = await gmail.ensure_label()
            connected_at = account.connected_at.replace(tzinfo=account.connected_at.tzinfo or UTC)
            ids = await gmail.list_new(label_id=account.label_id,
                                       max_results=settings.mail_max_per_sync, since=connected_at)
            account_email, label_id = account.email.lower(), account.label_id
        except Exception as exc:  # noqa: BLE001 - affiché au gérant dans Réglages
            account.last_error = str(exc)[:500]
            result.errors.append(str(exc))
            if own_client and gmail:
                await gmail.aclose()
            return result

    llm = llm or StructuredLLM(settings)
    try:
        for message_id in ids:
            try:
                await _process_one(settings, tenant, gmail, llm, message_id, account_email,
                                   label_id, autonomy, enabled, products, result, connected_at,
                                   quotes_autonomy, appointments_autonomy)
            except Exception as exc:
                log.exception("tenant %s: e-mail %s non traité", tenant.id, message_id)
                result.errors.append(f"{message_id}: {exc}")
                with session_scope(settings.database_url) as session:
                    _remember(session, tenant.id, message_id, status="erreur", error=str(exc)[:500])
    finally:
        if own_client:
            await gmail.aclose()

    with session_scope(settings.database_url) as session:
        account = get_account(session, tenant.id)
        if account:
            account.last_sync_at = datetime.now(UTC)
            account.last_error = "; ".join(result.errors)[:500] or None
    return result


def _remember(session: Session, tenant_id: str, provider_id: str, **fields) -> MailMessage:
    row = session.scalar(select(MailMessage).where(MailMessage.tenant_id == tenant_id,
                                                   MailMessage.provider_id == provider_id))
    if row is None:
        row = MailMessage(tenant_id=tenant_id, provider_id=provider_id)
        session.add(row)
    for k, v in fields.items():
        setattr(row, k, v)
    session.flush()
    return row


async def _process_one(settings, tenant, gmail, llm, message_id, account_email, label_id,
                       autonomy, enabled, products, result: SyncResult,
                       connected_at: datetime, quotes_autonomy: Autonomy,
                       appointments_autonomy: Autonomy) -> None:
    with session_scope(settings.database_url) as session:
        if session.scalar(select(MailMessage).where(MailMessage.tenant_id == tenant.id,
                                                    MailMessage.provider_id == message_id)):
            return  # déjà traité (ex. libellé retiré à la main)
    mail = await gmail.get(message_id)
    result.seen += 1
    base = {"thread_id": mail.thread_id, "from_email": mail.from_email, "subject": mail.subject,
            "received_at": mail.date}

    if mail.date < connected_at:
        # Arrivé avant la connexion de la boîte : on n'y touche pas (ni libellé,
        # ni réponse), le gérant l'a peut-être déjà traité.
        with session_scope(settings.database_url) as session:
            _remember(session, tenant.id, message_id, status="ignore", category="anterieur", **base)
        result.ignored += 1
        return
    if mail.from_email == account_email:
        with session_scope(settings.database_url) as session:
            _remember(session, tenant.id, message_id, status="ignore", category="personnel", **base)
        return
    if mail.is_bulk or mail.is_no_reply:
        with session_scope(settings.database_url) as session:
            _remember(session, tenant.id, message_id, status="ignore", category="publicite", **base)
        await gmail.add_label(message_id, label_id)
        result.ignored += 1
        return

    triage = await triage_mail(llm, tenant, mail)
    # Rendez-vous + module actif : créneaux réels proposés, ou réservation du choix.
    appt_plan = None
    if (triage.category == "rendez_vous" and ModuleKey.APPOINTMENTS in enabled
            and not triage.suspicious):
        appt_plan = await plan_appointment(llm, settings, tenant, mail)
    draft = None
    if triage.needs_reply:
        draft = await draft_reply(llm, tenant, mail, triage, products=products, modules=enabled,
                                  extra=appt_plan.instruction if appt_plan else None)
    action = decide_action(autonomy, triage, draft)
    if appt_plan and appt_plan.kind == "book" and draft is not None:
        action = "rdv"
    offer = (appt_plan.offer_payload(mail.thread_id)
             if appt_plan and appt_plan.kind == "offer" else None)

    # Demande de devis + module Devis actif : on prépare un vrai devis chiffré
    # depuis le catalogue, envoyé en pièce jointe après validation.
    quote_draft, catalog = None, []
    if triage.category == "devis" and ModuleKey.QUOTES in enabled and not triage.suspicious:
        with session_scope(settings.database_url) as session:
            catalog = list_catalog(session, tenant.id, only_active=True)
        request = f"Objet : {mail.subject}\n{triage.request_details or ''}\n\n{mail.text}"
        quote_draft = await draft_quote(llm, tenant, request, catalog)
        action = "devis"

    sent_id = None
    if action == "envoi_auto":
        sent_id = await _send(gmail, account_email, tenant, mail, draft.body)

    with session_scope(settings.database_url) as session:
        contact = find_or_create_contact(
            session, tenant.id, email=mail.from_email, phone=triage.customer_phone,
            first_name=triage.customer_first_name or (mail.from_name.split(" ")[0] or None),
            last_name=triage.customer_last_name,
        )
        if contact is not None and triage.company and not contact.company:
            contact.company = triage.company
        inbound = add_interaction(
            session, contact, tenant_id=tenant.id, channel="email", direction="entrant",
            intent=triage.category, title=CATEGORY_LABEL[triage.category],
            summary=triage.summary, body=mail.text, occurred_at=mail.date,
            external_id=message_id,
            data={"subject": mail.subject, "from": mail.from_email,
                  "importance": triage.importance, "request": triage.request_details,
                  "escalate": triage.escalate_reason if triage.must_escalate else None,
                  "suspicious": triage.suspicious},
        )
        row = _remember(session, tenant.id, message_id, category=triage.category,
                        importance=triage.importance, interaction_id=inbound.id, status="lu",
                        **base)
        result.filed += 1

        if action == "envoi_auto":
            add_interaction(session, contact, tenant_id=tenant.id, channel="email",
                            direction="sortant", title="Réponse envoyée par l'assistant",
                            summary=draft.body[:300], body=draft.body, external_id=sent_id,
                            data=offer or {})
            row.status = "envoye_auto"
            result.auto_sent += 1
        elif action == "rdv":
            await _book_from_email(session, settings, tenant, gmail, contact, row, mail, draft,
                                   appt_plan, appointments_autonomy, account_email, result)
        elif action == "devis":
            await _prepare_quote(session, settings, tenant, contact, row, mail, triage, draft,
                                 quote_draft, catalog, quotes_autonomy, result)
        elif action == "validation":
            warnings = []
            if triage.suspicious:
                warnings.append("⚠️ E-mail suspect : vérifiez l'expéditeur avant de répondre.")
            if triage.must_escalate and triage.escalate_reason:
                warnings.append(f"⚠️ {triage.escalate_reason}")
            if draft.missing_info:
                warnings.append("Infos manquantes : " + ", ".join(draft.missing_info))
            approval = await request_approval(
                session, settings, tenant, module=ModuleKey.EMAIL, kind="email_reponse",
                title=f"Répondre à {mail.from_name or mail.from_email} — {mail.subject}"[:250],
                summary="\n".join([triage.summary, *warnings]),
                payload={"mail_id": row.id, "to": mail.from_email, "subject": mail.subject,
                         "incoming": mail.text[:4000], "body": draft.body,
                         "category": triage.category, **({"appt_offer": offer} if offer else {})},
                contact=contact,
            )
            row.status, row.approval_id = "a_valider", approval.id
            result.to_validate += 1
    await gmail.add_label(message_id, label_id)


async def _book_from_email(session, settings, tenant, gmail, contact, row, mail, draft, plan,
                           autonomy: Autonomy, account_email: str, result: SyncResult) -> None:
    """Le client a choisi un des créneaux proposés : réservation puis confirmation."""
    confirmed = autonomy != Autonomy.VALIDATE_ALL
    try:
        appt = await book(session, settings, tenant, type_ref=plan.type_ref, start=plan.start,
                          contact=contact, source="email", confirmed=confirmed,
                          source_mail_id=row.id)
    except AgendaError as exc:
        # Créneau pris entre-temps : le gérant reprend la main.
        approval = await request_approval(
            session, settings, tenant, module=ModuleKey.EMAIL, kind="email_reponse",
            title=f"Rendez-vous impossible — {mail.from_name or mail.from_email}"[:250],
            summary=f"Le client a choisi un créneau qui n'est plus libre ({exc}). "
                    "Adaptez la réponse avant l'envoi.",
            payload={"mail_id": row.id, "to": mail.from_email, "subject": mail.subject,
                     "incoming": mail.text[:4000], "body": draft.body, "category": "rendez_vous"},
            contact=contact)
        row.status, row.approval_id = "a_valider", approval.id
        result.to_validate += 1
        return
    if confirmed:
        sent_id = await _send(gmail, account_email, tenant, mail, draft.body)
        add_interaction(session, contact, tenant_id=tenant.id, channel="email", direction="sortant",
                        intent="rendez_vous", title="Rendez-vous confirmé par e-mail",
                        summary=draft.body[:300], body=draft.body, external_id=sent_id)
        row.status = "envoye_auto"
        result.auto_sent += 1
        return
    approval = await request_approval(
        session, settings, tenant, module=ModuleKey.APPOINTMENTS, kind="rdv_confirmation",
        title=f"Rendez-vous à confirmer — {contact.display_name if contact else mail.from_email}",
        summary=f"{appt.type_name}, {plan.start:%d/%m à %H:%M}, choisi par e-mail. Le créneau est "
                "bloqué dans l'agenda ; valider envoie la confirmation au client.",
        payload={"appointment_id": appt.id, "email_body": draft.body, "incoming": mail.text[:4000]},
        contact=contact)
    row.status, row.approval_id = "a_valider", approval.id
    result.to_validate += 1


async def _prepare_quote(session, settings, tenant, contact, row, mail, triage, draft,
                         quote_draft, catalog, quotes_autonomy, result: SyncResult) -> None:
    bs = business_settings(session, tenant)
    quote = quote_from_draft(tenant, contact, quote_draft, catalog)
    quote.source_mail_id = row.id
    session.add(quote)
    refresh_totals(quote, bs)
    session.flush()
    body = draft.body if draft else ""
    complete = all(ln.get("unit_price") is not None for ln in quote.lines)
    if (quotes_autonomy == Autonomy.AUTOMATIC and complete and not quote_draft.questions
            and not triage.must_escalate and not missing_for_documents(bs)):
        try:
            await send_quote_email(session, settings, tenant, quote, body)
            row.status = "envoye_auto"
            result.auto_sent += 1
            return
        except QuoteError as exc:  # repli sur la validation
            log.warning("devis %s non envoyé automatiquement : %s", quote.id, exc)
    summary = [triage.summary, quote_summary(quote)]
    if quote.internal_notes:
        summary.append(quote.internal_notes)
    if not complete:
        summary.append("⚠️ Certains produits ne sont pas au catalogue : prix à compléter.")
    approval = await request_approval(
        session, settings, tenant, module=ModuleKey.QUOTES, kind="devis_envoi",
        title=f"Devis à envoyer — {contact.display_name if contact else mail.from_email}"[:250],
        summary="\n".join(summary),
        payload={"quote_id": quote.id, "email_body": body, "incoming": mail.text[:4000],
                 "to": mail.from_email},
        contact=contact,
    )
    quote.status = "a_valider"
    row.status, row.approval_id = "a_valider", approval.id
    result.to_validate += 1


@executor("email_reponse", editable=("body",))
async def send_validated_reply(session: Session, approval: Approval, settings: Settings) -> str:
    """Exécuté quand le gérant valide la réponse (web ou WhatsApp)."""
    from ..core.tenant_store import FileTenantStore

    row = session.get(MailMessage, approval.payload["mail_id"])
    account = get_account(session, approval.tenant_id)
    tenant = FileTenantStore(settings.tenants_dir).get(approval.tenant_id)
    if row is None or account is None or tenant is None:
        raise RuntimeError("boîte e-mail déconnectée : reconnectez Gmail puis réessayez")
    body = str(approval.payload.get("body") or "").strip()
    if not body:
        raise RuntimeError("la réponse est vide")
    gmail = GmailClient(await access_token(settings, account))
    try:
        original = await gmail.get(row.provider_id)
        sent_id = await _send(gmail, account.email, tenant, original, body)
    finally:
        await gmail.aclose()
    add_interaction(session, approval.contact, tenant_id=approval.tenant_id, channel="email",
                    direction="sortant", title="Réponse envoyée (validée)",
                    summary=body[:300], body=body, external_id=sent_id,
                    data=approval.payload.get("appt_offer") or {})
    row.status = "envoye"
    return f"e-mail envoyé à {original.from_email}"
