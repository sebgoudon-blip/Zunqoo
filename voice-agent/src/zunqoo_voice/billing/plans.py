"""Offres commerciales et droits associés.

Les montants sont indicatifs et se règlent ici, en un seul endroit. Le code
ne teste jamais un nom d'offre : il interroge les droits (``Entitlements``).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..core.models import Plan


@dataclass(frozen=True)
class Entitlements:
    monthly_minutes: int | None      # None = illimité (one-shot : le client paie ses API)
    max_phone_numbers: int
    whatsapp_reports: bool
    call_transfer: bool
    auto_kb_refresh: bool            # re-scraping périodique du site
    custom_voice: bool
    support: str


@dataclass(frozen=True)
class Offer:
    plan: Plan
    label: str
    setup_fee_eur: int
    monthly_fee_eur: int
    overage_eur_per_min: float | None
    entitlements: Entitlements


OFFERS: dict[Plan, Offer] = {
    Plan.ONE_SHOT: Offer(
        plan=Plan.ONE_SHOT,
        label="Licence + installation (le client héberge et paie ses fournisseurs IA)",
        setup_fee_eur=2490,
        monthly_fee_eur=0,
        overage_eur_per_min=None,
        entitlements=Entitlements(
            monthly_minutes=None, max_phone_numbers=2, whatsapp_reports=True,
            call_transfer=True, auto_kb_refresh=False, custom_voice=True,
            support="90 jours inclus, puis contrat de maintenance optionnel",
        ),
    ),
    Plan.SAAS_STARTER: Offer(
        plan=Plan.SAAS_STARTER,
        label="Abonnement Essentiel",
        setup_fee_eur=0,
        monthly_fee_eur=79,
        overage_eur_per_min=0.25,
        entitlements=Entitlements(
            monthly_minutes=300, max_phone_numbers=1, whatsapp_reports=True,
            call_transfer=False, auto_kb_refresh=True, custom_voice=False,
            support="email",
        ),
    ),
    Plan.SAAS_PRO: Offer(
        plan=Plan.SAAS_PRO,
        label="Abonnement Pro",
        setup_fee_eur=0,
        monthly_fee_eur=169,
        overage_eur_per_min=0.18,
        entitlements=Entitlements(
            monthly_minutes=1000, max_phone_numbers=3, whatsapp_reports=True,
            call_transfer=True, auto_kb_refresh=True, custom_voice=True,
            support="téléphone + WhatsApp, mises à jour de la base de connaissances incluses",
        ),
    ),
}


def entitlements_for(plan: Plan) -> Entitlements:
    return OFFERS[plan].entitlements
