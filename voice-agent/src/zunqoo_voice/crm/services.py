"""Logique métier du CRM, indépendante de l'API et du worker vocal."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core.models import BusinessProfile, CallRecord, Product
from ..core.tenant_store import normalize_number
from .db import Approval, CatalogItem, Contact, Interaction, ModuleSetting
from .modules import (
    MODULES,
    Autonomy,
    ModuleConfigError,
    ModuleKey,
    dependents_of,
    validate_selection,
)

# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------

# Tenant sans réglage enregistré : on conserve le comportement historique.
DEFAULT_ENABLED = {ModuleKey.PHONE, ModuleKey.ORDERS}


@dataclass
class ModuleState:
    key: ModuleKey
    enabled: bool
    autonomy: Autonomy


def get_modules(session: Session, tenant_id: str) -> dict[ModuleKey, ModuleState]:
    rows = {
        r.module: r
        for r in session.scalars(select(ModuleSetting).where(ModuleSetting.tenant_id == tenant_id))
    }
    states: dict[ModuleKey, ModuleState] = {}
    for key, mod in MODULES.items():
        row = rows.get(key.value)
        enabled = row.enabled if row else key in DEFAULT_ENABLED
        states[key] = ModuleState(
            key=key,
            enabled=enabled and mod.available,
            autonomy=Autonomy(row.autonomy) if row else mod.default_autonomy,
        )
    return states


def enabled_modules(session: Session, tenant_id: str) -> set[ModuleKey]:
    return {k for k, s in get_modules(session, tenant_id).items() if s.enabled}


def set_modules(
    session: Session,
    tenant_id: str,
    enabled: set[ModuleKey],
    autonomy: dict[ModuleKey, Autonomy] | None = None,
) -> dict[ModuleKey, ModuleState]:
    unavailable = [MODULES[k].label for k in enabled if not MODULES[k].available]
    if unavailable:
        raise ModuleConfigError("pas encore disponible : " + ", ".join(unavailable))
    validate_selection(enabled)
    current = get_modules(session, tenant_id)
    autonomy = autonomy or {}
    for key in MODULES:
        row = session.scalar(
            select(ModuleSetting).where(
                ModuleSetting.tenant_id == tenant_id, ModuleSetting.module == key.value
            )
        )
        if row is None:
            row = ModuleSetting(tenant_id=tenant_id, module=key.value)
            session.add(row)
        row.enabled = key in enabled
        row.autonomy = autonomy.get(key, current[key].autonomy).value
    session.flush()
    return get_modules(session, tenant_id)


def toggle_module(
    session: Session, tenant_id: str, key: ModuleKey, on: bool
) -> dict[ModuleKey, ModuleState]:
    """Activer ajoute les prérequis ; désactiver coupe les modules qui en dépendent."""
    enabled = enabled_modules(session, tenant_id)
    if on:
        enabled.add(key)
        enabled.update(MODULES[key].requires)
    else:
        enabled.discard(key)
        enabled.difference_update(dependents_of(key))
    return set_modules(session, tenant_id, enabled)


# ---------------------------------------------------------------------------
# Contacts et historique
# ---------------------------------------------------------------------------


def find_or_create_contact(
    session: Session,
    tenant_id: str,
    *,
    phone: str | None = None,
    email: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
) -> Contact | None:
    phone = normalize_number(phone) if phone and len(re.sub(r"\D", "", phone)) >= 6 else None
    email = email.strip().lower() if email else None
    if not (phone or email):
        return None
    conditions = []
    if phone:
        conditions.append(Contact.phone == phone)
    if email:
        conditions.append(Contact.email == email)
    contact = session.scalar(
        select(Contact).where(Contact.tenant_id == tenant_id, or_(*conditions)).limit(1)
    )
    if contact is None:
        contact = Contact(tenant_id=tenant_id, phone=phone, email=email)
        session.add(contact)
    # On complète la fiche sans écraser ce que le gérant a saisi.
    contact.phone = contact.phone or phone
    contact.email = contact.email or email
    contact.first_name = contact.first_name or first_name
    contact.last_name = contact.last_name or last_name
    session.flush()
    return contact


def add_interaction(session: Session, contact: Contact | None, **fields) -> Interaction:
    interaction = Interaction(contact=contact, **fields)
    session.add(interaction)
    if contact is not None:
        contact.last_interaction_at = interaction.occurred_at or datetime.now(UTC)
    session.flush()
    return interaction


def record_call(session: Session, record: CallRecord) -> Interaction:
    """Range un appel terminé dans le CRM (fiche client + historique)."""
    report = record.report
    contact = find_or_create_contact(
        session,
        record.tenant_id,
        phone=(report.customer_phone if report else None) or record.caller_number,
        first_name=report.customer_first_name if report else None,
        last_name=report.customer_last_name if report else None,
    )
    title = "Appel reçu"
    if report:
        title = {
            "commande": "Commande par téléphone",
            "renseignement": "Demande de renseignement",
            "reclamation": "Réclamation",
            "rappel_demande": "Demande de rappel",
        }.get(report.intent.value, "Appel reçu")
    return add_interaction(
        session,
        contact,
        tenant_id=record.tenant_id,
        channel="appel",
        intent=report.intent.value if report else None,
        title=title,
        summary=report.summary if report else None,
        body=record.transcript,
        data={
            "duration_s": round(record.duration_s),
            "caller_number": record.caller_number,
            "report": report.model_dump(mode="json") if report else None,
        },
        external_id=record.call_id,
        occurred_at=record.started_at,
    )


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------


_PRICE_ON_REQUEST = {"sur demande", "sur devis", "nc", "n.c.", "-", "—"}


def parse_price(value: str | float | Decimal | None) -> Decimal | None:
    """'12,90 €' / '12.9' / '1 250,00' -> Decimal ; vide -> None."""
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value)).quantize(Decimal("0.01"))
    if value.strip().lower() in _PRICE_ON_REQUEST:
        return None
    if value.strip(" €") and not re.search(r"\d", value):
        raise ValueError(f"prix illisible : {value!r}")
    text = re.sub(r"[^\d,.\-]", "", value.replace(" ", "").replace(" ", ""))
    if not text:
        return None
    if "," in text and "." in text:  # 1.250,00 -> 1250.00
        text = text.replace(".", "")
    text = text.replace(",", ".")
    try:
        return Decimal(text).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValueError(f"prix illisible : {value!r}") from exc


def list_catalog(session: Session, tenant_id: str, *, only_active: bool = False) -> list[CatalogItem]:
    q = select(CatalogItem).where(CatalogItem.tenant_id == tenant_id)
    if only_active:
        q = q.where(CatalogItem.active.is_(True))
    return list(session.scalars(q.order_by(CatalogItem.category, CatalogItem.position,
                                           CatalogItem.name)))


def seed_catalog_from_profile(
    session: Session, tenant_id: str, profile: BusinessProfile, *, vat_rate: float = 20.0
) -> int:
    """Premier remplissage depuis le site. Ne touche jamais un catalogue existant."""
    existing = session.scalar(
        select(func.count()).select_from(CatalogItem).where(CatalogItem.tenant_id == tenant_id)
    )
    if existing:
        return 0
    for i, p in enumerate(profile.products):
        session.add(CatalogItem(
            tenant_id=tenant_id, name=p.name, category=p.category, description=p.description,
            unit=p.unit, price=parse_price(p.price), price_includes_vat=True,  # prix public
            vat_rate=Decimal(str(vat_rate)), availability=p.availability,
            source="site", position=i,
        ))
    session.flush()
    return len(profile.products)


_CSV_COLUMNS = {
    "name": ("nom", "produit", "designation", "désignation", "article", "name"),
    "category": ("categorie", "catégorie", "famille", "rayon", "category"),
    "price": ("prix", "prix ttc", "prix_ttc", "tarif", "price"),
    "price_ht": ("prix ht", "prix_ht", "tarif ht"),
    "vat_rate": ("tva", "taux tva", "vat"),
    "unit": ("unite", "unité", "unit"),
    "description": ("description", "detail", "détail"),
    "availability": ("disponibilite", "disponibilité", "availability"),
}


@dataclass
class ImportResult:
    created: int
    updated: int
    errors: list[str]


def import_catalog_csv(
    session: Session,
    tenant_id: str,
    content: bytes,
    *,
    default_vat_rate: float = 20.0,
    prices_include_vat: bool = True,
) -> ImportResult:
    """Import CSV (export Excel « CSV UTF-8 » ou point-virgule) : met à jour par nom.

    Une colonne « prix HT » est lue comme du HT ; « prix » / « prix TTC » suit
    le réglage du commerce (TTC par défaut pour un commerce de détail).
    """
    text = content.decode("utf-8-sig", errors="replace")
    dialect = csv.Sniffer().sniff(text[:2048], delimiters=";,\t") if text.strip() else csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    header_map: dict[str, str] = {}
    for col in reader.fieldnames or []:
        norm = col.strip().lower()
        for field, aliases in _CSV_COLUMNS.items():
            if norm in aliases:
                header_map[col] = field
    if "name" not in header_map.values():
        return ImportResult(0, 0, ["colonne « nom » introuvable (nom, produit, désignation…)"])

    existing = {i.name.strip().lower(): i for i in list_catalog(session, tenant_id)}
    created = updated = 0
    errors: list[str] = []
    for line_no, row in enumerate(reader, start=2):
        values = {header_map[k]: (v or "").strip() for k, v in row.items() if k in header_map}
        name = values.get("name")
        if not name:
            continue
        try:
            if values.get("price_ht"):
                price, incl = parse_price(values["price_ht"]), False
            else:
                price, incl = parse_price(values.get("price")), prices_include_vat
            vat = parse_price(values["vat_rate"].rstrip("%")) if values.get("vat_rate") else None
        except ValueError as exc:
            errors.append(f"ligne {line_no} : {exc}")
            continue
        item = existing.get(name.lower())
        if item is None:
            item = CatalogItem(tenant_id=tenant_id, name=name, source="import",
                               vat_rate=Decimal(str(default_vat_rate)))
            session.add(item)
            existing[name.lower()] = item
            created += 1
        else:
            updated += 1
        if price is not None:
            item.price, item.price_includes_vat = price, incl
        if vat is not None:
            item.vat_rate = vat
        for field in ("category", "unit", "description", "availability"):
            if values.get(field):
                setattr(item, field, values[field])
    session.flush()
    return ImportResult(created, updated, errors)


def catalog_as_products(items: list[CatalogItem]) -> list[Product]:
    """Catalogue CRM -> format lu par l'agent vocal (prix TTC, ce que dit le client)."""
    products = []
    for i in items:
        ttc = float(i.price_ttc) if i.price_ttc is not None else None
        products.append(Product(name=i.name, category=i.category, price=ttc, unit=i.unit,
                                description=i.description, availability=i.availability))
    return products


# ---------------------------------------------------------------------------
# Validations
# ---------------------------------------------------------------------------


def create_approval(
    session: Session,
    *,
    tenant_id: str,
    module: ModuleKey,
    kind: str,
    title: str,
    summary: str,
    payload: dict,
    contact: Contact | None = None,
) -> Approval:
    approval = Approval(tenant_id=tenant_id, module=module.value, kind=kind, title=title,
                        summary=summary, payload=payload, contact=contact)
    session.add(approval)
    session.flush()
    return approval


def pending_approvals(session: Session, tenant_id: str) -> list[Approval]:
    return list(session.scalars(
        select(Approval)
        .where(Approval.tenant_id == tenant_id, Approval.status == "en_attente")
        .order_by(Approval.created_at)
    ))
