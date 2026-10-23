"""Onboarding automatique : URL -> fiche tenant prête à décrocher."""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse

from ..core.config import Settings
from ..core.models import BusinessProfile, Plan, TenantConfig, WhatsAppConfig
from ..core.structured_llm import StructuredLLM
from ..core.tenant_store import TenantStore, normalize_number
from ..crm.db import session_scope
from ..crm.services import seed_catalog_from_profile
from .crawler import SiteCrawler
from .extractor import extract_profile


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "tenant"


async def scrape_profile(url: str, settings: Settings) -> BusinessProfile:
    crawl = await SiteCrawler(max_pages=settings.scraper_max_pages).crawl(url)
    return await extract_profile(crawl, StructuredLLM(settings))


async def onboard_from_url(
    url: str,
    store: TenantStore,
    settings: Settings,
    *,
    tenant_id: str | None = None,
    plan: Plan = Plan.SAAS_STARTER,
    phone_numbers: list[str] | None = None,
    manager_whatsapp: list[str] | None = None,
) -> TenantConfig:
    """Crée ou rafraîchit un tenant à partir de son site.

    Si le tenant existe déjà, seule la fiche ``profile`` est remplacée : les
    réglages faits à la main (voix, numéros, WhatsApp) sont conservés.
    """
    profile = await scrape_profile(url, settings)
    tenant_id = tenant_id or slugify(profile.name or urlparse(url).netloc)

    existing = store.get(tenant_id)
    if existing:
        existing.profile = profile
        existing.source_url = url
        tenant = existing
    else:
        tenant = TenantConfig(
            id=tenant_id,
            plan=plan,
            source_url=url,
            profile=profile,
            phone_numbers=[normalize_number(n) for n in phone_numbers or []],
            whatsapp=WhatsAppConfig(
                manager_numbers=[normalize_number(n).lstrip("+") for n in manager_whatsapp or []]
            ),
        )
    store.save(tenant)
    # Catalogue du CRM : rempli depuis le site s'il est vide, jamais écrasé.
    with session_scope(settings.database_url) as session:
        seed_catalog_from_profile(session, tenant.id, profile, vat_rate=tenant.default_vat_rate)
    return tenant
