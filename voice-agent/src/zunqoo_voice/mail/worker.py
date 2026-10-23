"""Relève périodique des e-mails de tous les commerces.

    zunqoo-mail genkey              # clé MAIL_TOKEN_KEY (une fois)
    zunqoo-mail run                 # boucle : relève toutes les MAIL_POLL_SECONDS
    zunqoo-mail sync rotisserie-x   # une relève immédiate, pour tester
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from ..agenda.service import send_day_before_reminders
from ..core.config import Settings, get_settings
from ..core.tenant_store import FileTenantStore
from ..crm.db import Appointment, Invoice, MailAccount, Quote, session_scope
from ..crm.modules import ModuleKey
from ..crm.services import enabled_modules
from ..documents.invoices import schedule_invoice_reminders
from ..documents.quotes import due_reminders, schedule_reminders
from .account import get_account
from .crypto import generate_key
from .processor import sync_tenant

log = logging.getLogger("zunqoo.mail")


async def quote_followups(settings: Settings, store: FileTenantStore) -> None:
    """Devis expirés et relances dues (J+3, J+7), pour les commerces concernés."""
    now = datetime.now(UTC)
    with session_scope(settings.database_url) as session:
        tenant_ids = set(session.scalars(select(Quote.tenant_id).where(Quote.status == "envoye")))
    for tenant_id in tenant_ids:
        tenant = store.get(tenant_id)
        if tenant is None:
            continue
        with session_scope(settings.database_url) as session:
            if ModuleKey.QUOTES not in enabled_modules(session, tenant_id):
                continue
            if get_account(session, tenant_id) is None:
                due_reminders(session, tenant_id, now)  # expire seulement
                continue
            n = await schedule_reminders(session, settings, tenant, now)
            if n:
                log.info("%s: %d relance(s) de devis proposée(s)", tenant_id, n)


async def invoice_followups(settings: Settings, store: FileTenantStore) -> None:
    """Factures échues : relances proposées à J+3 puis J+15 après l'échéance."""
    now = datetime.now(UTC)
    with session_scope(settings.database_url) as session:
        tenant_ids = set(session.scalars(select(Invoice.tenant_id).where(
            Invoice.status.in_(("emise", "partiellement_payee")))))
    for tenant_id in tenant_ids:
        tenant = store.get(tenant_id)
        if tenant is None:
            continue
        with session_scope(settings.database_url) as session:
            if (ModuleKey.INVOICES not in enabled_modules(session, tenant_id)
                    or get_account(session, tenant_id) is None):
                continue
            n = await schedule_invoice_reminders(session, settings, tenant, now)
            if n:
                log.info("%s: %d relance(s) de facture proposée(s)", tenant_id, n)


async def appointment_followups(settings: Settings, store: FileTenantStore) -> None:
    """Rappel par e-mail, la veille, aux clients qui ont rendez-vous."""
    now = datetime.now(UTC)
    with session_scope(settings.database_url) as session:
        tenant_ids = set(session.scalars(select(Appointment.tenant_id).where(
            Appointment.status == "confirme", Appointment.reminder_sent.is_(False),
            Appointment.start > now, Appointment.start < now + timedelta(days=2))))
    for tenant_id in tenant_ids:
        tenant = store.get(tenant_id)
        if tenant is None:
            continue
        with session_scope(settings.database_url) as session:
            if ModuleKey.APPOINTMENTS not in enabled_modules(session, tenant_id):
                continue
            n = await send_day_before_reminders(session, settings, tenant, now)
            if n:
                log.info("%s: %d rappel(s) de rendez-vous envoyé(s)", tenant_id, n)


async def sync_all(settings: Settings) -> None:
    with session_scope(settings.database_url) as session:
        tenant_ids = list(session.scalars(select(MailAccount.tenant_id)
                                          .where(MailAccount.active.is_(True))))
    store = FileTenantStore(settings.tenants_dir)
    for followup in (quote_followups, invoice_followups, appointment_followups):
        try:
            await followup(settings, store)
        except Exception:
            log.exception("suivi %s échoué", followup.__name__)
    for tenant_id in tenant_ids:
        tenant = store.get(tenant_id)
        if tenant is None or not tenant.active:
            continue
        try:
            r = await sync_tenant(settings, tenant)
            if r.seen:
                log.info("%s: %d vus, %d classés, %d envoyés seuls, %d à valider, %d ignorés",
                         tenant_id, r.seen, r.filed, r.auto_sent, r.to_validate, r.ignored)
        except Exception:
            log.exception("relève e-mail de %s échouée", tenant_id)


async def run_forever(settings: Settings) -> None:
    log.info("relève e-mail toutes les %d s", settings.mail_poll_seconds)
    while True:
        await sync_all(settings)
        await asyncio.sleep(settings.mail_poll_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Relève des e-mails Zunqoo")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("genkey")
    sub.add_parser("run")
    once = sub.add_parser("sync")
    once.add_argument("tenant")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.cmd == "genkey":
        print(f"MAIL_TOKEN_KEY={generate_key()}")
        return
    settings = get_settings()
    if args.cmd == "run":
        asyncio.run(run_forever(settings))
    else:
        tenant = FileTenantStore(settings.tenants_dir).get(args.tenant)
        if tenant is None:
            raise SystemExit(f"commerce inconnu : {args.tenant}")
        print(asyncio.run(sync_tenant(settings, tenant)))


if __name__ == "__main__":
    main()
