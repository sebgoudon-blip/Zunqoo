"""Modules activables par le client, leurs dépendances et leur autonomie.

Règle produit : un client n'active que ce dont il a besoin. Un module
désactivé n'apparaît nulle part (écrans, outils de l'agent, messages).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ModuleKey(str, Enum):
    PHONE = "telephone"
    ORDERS = "commandes"
    APPOINTMENTS = "rendez_vous"
    EMAIL = "emails"
    QUOTES = "devis"
    INVOICES = "factures"
    DAILY_SUMMARY = "resume_quotidien"
    REVIEWS = "avis_google"


class Autonomy(str, Enum):
    VALIDATE_ALL = "valider_tout"          # rien ne part sans validation
    VALIDATE_IMPORTANT = "valider_important"  # le courant part seul, l'engageant est validé
    AUTOMATIC = "automatique"


@dataclass(frozen=True)
class ModuleDef:
    key: ModuleKey
    label: str
    description: str
    requires: tuple[ModuleKey, ...] = ()
    # Le module produit-il des actions validables ? (sinon pas de réglage d'autonomie)
    has_autonomy: bool = True
    # Disponible dans cette version du produit ?
    available: bool = True
    default_autonomy: Autonomy = Autonomy.VALIDATE_IMPORTANT


MODULES: dict[ModuleKey, ModuleDef] = {
    m.key: m
    for m in [
        ModuleDef(
            ModuleKey.PHONE, "Standard téléphonique",
            "Répond au téléphone 24 h/24, renseigne sur les horaires, produits et prix.",
            has_autonomy=False,
        ),
        ModuleDef(
            ModuleKey.ORDERS, "Prise de commandes",
            "Prend les commandes au téléphone et vous envoie le compte-rendu sur WhatsApp.",
            requires=(ModuleKey.PHONE,), has_autonomy=False,
        ),
        ModuleDef(
            ModuleKey.APPOINTMENTS, "Rendez-vous",
            "Propose des créneaux libres, réserve dans votre agenda et rappelle la veille.",
            available=False,
        ),
        ModuleDef(
            ModuleKey.EMAIL, "E-mails",
            "Lit votre boîte Gmail, trie les messages et prépare ou envoie les réponses.",
            # Vraie boîte, vrais clients : rien ne part sans accord tant que le
            # gérant n'a pas choisi d'aller plus loin.
            default_autonomy=Autonomy.VALIDATE_ALL,
        ),
        ModuleDef(
            ModuleKey.QUOTES, "Devis",
            "Rédige les devis à partir de votre catalogue, avec relances automatiques.",
            default_autonomy=Autonomy.VALIDATE_ALL,
        ),
        ModuleDef(
            ModuleKey.INVOICES, "Factures",
            "Transforme un devis accepté en facture conforme et suit les paiements.",
            requires=(ModuleKey.QUOTES,), available=False,
            default_autonomy=Autonomy.VALIDATE_ALL,
        ),
        ModuleDef(
            ModuleKey.DAILY_SUMMARY, "Résumé du soir",
            "Chaque soir sur WhatsApp : appels, demandes, éléments à valider, agenda du lendemain.",
            has_autonomy=False, available=False,
        ),
        ModuleDef(
            ModuleKey.REVIEWS, "Avis Google",
            "Demande un avis Google aux clients satisfaits après une commande.",
            available=False,
        ),
    ]
}

PRESETS: dict[str, tuple[str, list[ModuleKey]]] = {
    "telephone": ("Juste le téléphone", [ModuleKey.PHONE]),
    "commerce": (
        "Téléphone + commandes et rendez-vous",
        [ModuleKey.PHONE, ModuleKey.ORDERS, ModuleKey.APPOINTMENTS],
    ),
    "complet": ("Tout", list(ModuleKey)),
}


class ModuleConfigError(ValueError):
    pass


def validate_selection(enabled: set[ModuleKey]) -> None:
    """Refuse une sélection incohérente (ex. factures sans devis)."""
    for key in enabled:
        missing = [r for r in MODULES[key].requires if r not in enabled]
        if missing:
            names = ", ".join(MODULES[r].label for r in missing)
            raise ModuleConfigError(f"« {MODULES[key].label} » nécessite : {names}")


def dependents_of(key: ModuleKey) -> list[ModuleKey]:
    """Modules qui seront coupés si on désactive ``key``."""
    out: list[ModuleKey] = []
    for m in MODULES.values():
        if key in m.requires:
            out.append(m.key)
            out.extend(dependents_of(m.key))
    return out


def preset_selection(preset: str) -> set[ModuleKey]:
    if preset not in PRESETS:
        raise ModuleConfigError(f"formule inconnue : {preset}")
    return {k for k in PRESETS[preset][1] if MODULES[k].available}
