"""Modèles métier normalisés.

- ``BusinessProfile`` : la fiche commerce extraite du site web (JSON métier
  injecté dans le prompt système de l'agent).
- ``CallReport`` : l'extraction structurée d'un appel terminé (envoyée au
  gérant sur WhatsApp).
- ``TenantConfig`` : tout ce qui est propre à un commerçant client.

Les schémas restent volontairement plats et sans contraintes numériques :
ils servent aussi de schéma de sortie structurée pour le LLM.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, SecretStr

# ---------------------------------------------------------------------------
# Fiche commerce (sortie du scraper)
# ---------------------------------------------------------------------------

Weekday = Literal["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


class Contact(BaseModel):
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    website: str | None = None
    social_links: list[str] = Field(default_factory=list)


class OpeningSlot(BaseModel):
    """Créneau d'ouverture en boutique (ou de présence fixe)."""

    day: Weekday
    opens: str = Field(description="Heure d'ouverture HH:MM")
    closes: str = Field(description="Heure de fermeture HH:MM")
    note: str | None = None


class MarketPresence(BaseModel):
    """Présence sur un marché / tournée (cas typique d'une rôtisserie)."""

    day: Weekday
    place: str = Field(description="Ville, marché ou adresse")
    opens: str | None = None
    closes: str | None = None
    note: str | None = None


class DeliveryInfo(BaseModel):
    available: bool = False
    zones: list[str] = Field(default_factory=list)
    days: list[Weekday] = Field(default_factory=list)
    fee: str | None = None
    minimum_order: str | None = None
    note: str | None = None


class Product(BaseModel):
    name: str
    category: str | None = None
    price: float | None = Field(default=None, description="Prix en euros, null si inconnu")
    unit: str | None = Field(default=None, description="pièce, kg, portion, barquette…")
    description: str | None = None
    availability: str | None = Field(
        default=None, description="Ex: 'sur commande', 'week-end uniquement'"
    )


class FaqItem(BaseModel):
    question: str
    answer: str


class BusinessProfile(BaseModel):
    name: str
    activity: str = Field(description="Ex: rôtisserie artisanale, boulangerie…")
    description: str | None = None
    contact: Contact = Field(default_factory=Contact)
    opening_hours: list[OpeningSlot] = Field(default_factory=list)
    market_presence: list[MarketPresence] = Field(default_factory=list)
    delivery: DeliveryInfo = Field(default_factory=DeliveryInfo)
    products: list[Product] = Field(default_factory=list)
    faq: list[FaqItem] = Field(default_factory=list)
    ordering_rules: list[str] = Field(
        default_factory=list,
        description="Règles de commande : délai, acompte, quantités minimales…",
    )
    payment_methods: list[str] = Field(default_factory=list)
    extra_notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Compte-rendu d'appel (sortie de l'analyse post-appel)
# ---------------------------------------------------------------------------


class CallIntent(str, Enum):
    ORDER = "commande"
    ORDER_CHANGE = "modification_commande"
    CANCELLATION = "annulation"
    INFORMATION = "renseignement"
    COMPLAINT = "reclamation"
    CALLBACK = "rappel_demande"
    OTHER = "autre"


class OrderLine(BaseModel):
    product: str
    quantity: float = 1
    unit: str | None = None
    notes: str | None = None


class CallReport(BaseModel):
    intent: CallIntent
    customer_first_name: str | None = None
    customer_last_name: str | None = None
    customer_phone: str | None = Field(
        default=None, description="Numéro donné à l'oral, sinon null"
    )
    order_lines: list[OrderLine] = Field(default_factory=list)
    fulfillment: Literal["retrait", "livraison", "inconnu"] = "inconnu"
    requested_day: str | None = Field(
        default=None, description="Jour/créneau tel que dit par le client, ex: 'samedi matin'"
    )
    requested_date: str | None = Field(
        default=None, description="Date ISO AAAA-MM-JJ si déductible, sinon null"
    )
    pickup_location: str | None = Field(default=None, description="Boutique, marché de X…")
    delivery_address: str | None = None
    customer_notes: str | None = Field(
        default=None, description="Demandes particulières, mot pour mot si possible"
    )
    summary: str = Field(description="Résumé en une ou deux phrases pour le gérant")
    needs_callback: bool = False


class CallRecord(BaseModel):
    """Ce qui est persisté/relayé après un appel."""

    tenant_id: str
    call_id: str
    caller_number: str | None = None
    started_at: datetime
    ended_at: datetime
    duration_s: float
    transcript: str
    report: CallReport | None = None


# ---------------------------------------------------------------------------
# Tenant (commerçant client)
# ---------------------------------------------------------------------------


class Plan(str, Enum):
    ONE_SHOT = "one_shot"         # licence perpétuelle / installation
    SAAS_STARTER = "saas_starter"
    SAAS_PRO = "saas_pro"


class WhatsAppConfig(BaseModel):
    manager_numbers: list[str] = Field(
        default_factory=list, description="Numéros E.164 sans '+', ex: 33612345678"
    )
    # Si vide, on utilise le compte WhatsApp Business de la plateforme.
    phone_number_id: str | None = None
    access_token: SecretStr | None = None
    template_name: str | None = None
    template_lang: str | None = None


class VoiceConfig(BaseModel):
    tts_provider: Literal["elevenlabs", "cartesia"] | None = None
    voice_id: str | None = None
    agent_name: str = "Camille"
    language: str = "fr"
    speaking_rate: float | None = None


class TenantConfig(BaseModel):
    id: str
    plan: Plan = Plan.SAAS_STARTER
    active: bool = True
    timezone: str = "Europe/Paris"
    source_url: str | None = None
    # Numéros SDA (E.164 avec '+') qui routent vers ce tenant.
    phone_numbers: list[str] = Field(default_factory=list)
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    whatsapp: WhatsAppConfig = Field(default_factory=WhatsAppConfig)
    # Facturation : taux de TVA par défaut des produits et nature des prix saisis.
    default_vat_rate: float = 20.0
    prices_include_vat: bool = True  # commerce de détail : prix affichés TTC
    # Numéro (E.164) vers lequel transférer l'appel si le client veut un humain.
    transfer_number: str | None = None
    greeting: str | None = None
    custom_instructions: str | None = None
    profile: BusinessProfile
    updated_at: datetime | None = None
