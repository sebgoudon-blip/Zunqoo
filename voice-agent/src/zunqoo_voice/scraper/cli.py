"""CLI d'onboarding.

    zunqoo-onboard https://www.ma-rotisserie.fr \\
        --tenant rotisserie-dupont --sda +33187000000 --whatsapp 0612345678

    zunqoo-onboard https://www.ma-rotisserie.fr --dry-run   # affiche le JSON
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from ..core.config import get_settings
from ..core.models import Plan
from ..core.tenant_store import FileTenantStore
from .onboarding import onboard_from_url, scrape_profile


def main() -> None:
    parser = argparse.ArgumentParser(description="Onboarding d'un commerce depuis son site web")
    parser.add_argument("url")
    parser.add_argument("--tenant", help="identifiant du tenant (déduit du nom sinon)")
    parser.add_argument("--plan", choices=[p.value for p in Plan], default=Plan.SAAS_STARTER.value)
    parser.add_argument("--sda", action="append", default=[], help="numéro de téléphone entrant")
    parser.add_argument("--whatsapp", action="append", default=[], help="numéro du gérant")
    parser.add_argument("--dry-run", action="store_true", help="affiche la fiche sans l'enregistrer")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()

    if args.dry_run:
        profile = asyncio.run(scrape_profile(args.url, settings))
        print(profile.model_dump_json(indent=2))
        return

    tenant = asyncio.run(
        onboard_from_url(
            args.url,
            FileTenantStore(settings.tenants_dir),
            settings,
            tenant_id=args.tenant,
            plan=Plan(args.plan),
            phone_numbers=args.sda,
            manager_whatsapp=args.whatsapp,
        )
    )
    p = tenant.profile
    print(
        f"Tenant '{tenant.id}' enregistré : {p.name} — {len(p.products)} produits, "
        f"{len(p.opening_hours)} créneaux, {len(p.market_presence)} marchés, {len(p.faq)} FAQ."
    )


if __name__ == "__main__":
    main()
