"""Base de données du CRM (SQLAlchemy 2).

SQLite par défaut (une instance, un fichier) ; ``DATABASE_URL`` vers
Postgres en SaaS multi-instances. Toutes les tables portent ``tenant_id`` :
chaque requête est filtrée par commerce, jamais de mélange entre clients.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, ClassVar

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict] = {dict[str, Any]: JSON, datetime: DateTime(timezone=True)}


class User(Base):
    """Utilisateur du CRM (gérant, employé) rattaché à un commerce."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin | membre
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class ModuleSetting(Base):
    __tablename__ = "module_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "module"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    module: Mapped[str] = mapped_column(String(40))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    autonomy: Mapped[str] = mapped_column(String(30))
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class Contact(Base):
    """Fiche client unique, alimentée par tous les canaux."""

    __tablename__ = "contacts"
    __table_args__ = (Index("ix_contacts_tenant_phone", "tenant_id", "phone"),
                      Index("ix_contacts_tenant_email", "tenant_id", "email"))
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    company: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(32))   # E.164
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    last_interaction_at: Mapped[datetime | None] = mapped_column()

    interactions: Mapped[list[Interaction]] = relationship(
        back_populates="contact", order_by="Interaction.occurred_at.desc()"
    )

    @property
    def display_name(self) -> str:
        name = " ".join(p for p in (self.first_name, self.last_name) if p)
        return name or self.company or self.phone or self.email or "Client sans nom"


class Interaction(Base):
    """Un élément de l'historique : appel, e-mail, WhatsApp, note, devis…"""

    __tablename__ = "interactions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id"), index=True)
    channel: Mapped[str] = mapped_column(String(20))   # appel | email | whatsapp | note
    direction: Mapped[str] = mapped_column(String(10), default="entrant")
    intent: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)     # transcription, texte de l'e-mail…
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)  # commande, rapport structuré
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    occurred_at: Mapped[datetime] = mapped_column(default=_now)

    contact: Mapped[Contact | None] = relationship(back_populates="interactions")


class CatalogItem(Base):
    __tablename__ = "catalog_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(40))
    # Prix tel que saisi par le commerçant ; None = non communiqué (l'agent ne
    # l'invente pas). ``price_includes_vat`` dit si c'est du TTC ou du HT : on
    # ne convertit jamais à la saisie, donc aucun arrondi ne fausse le prix.
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_includes_vat: Mapped[bool] = mapped_column(Boolean, default=True)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(20))
    availability: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(20), default="manuel")  # site | manuel | import
    position: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    @property
    def price_ttc(self) -> Decimal | None:
        if self.price is None:
            return None
        if self.price_includes_vat:
            return self.price
        return (self.price * (1 + self.vat_rate / 100)).quantize(Decimal("0.01"))

    @property
    def price_ht(self) -> Decimal | None:
        if self.price is None:
            return None
        if not self.price_includes_vat:
            return self.price
        return (self.price / (1 + self.vat_rate / 100)).quantize(Decimal("0.01"))


class Approval(Base):
    """Action préparée par l'assistant, en attente de la décision du gérant."""

    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    module: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(40))        # ex. email_reponse, devis_envoi
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(default=dict)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id"))
    status: Mapped[str] = mapped_column(String(20), default="en_attente", index=True)
    # en_attente | approuve | refuse | execute | echec
    created_at: Mapped[datetime] = mapped_column(default=_now)
    decided_at: Mapped[datetime | None] = mapped_column()
    decided_by: Mapped[str | None] = mapped_column(String(255))
    decision_channel: Mapped[str | None] = mapped_column(String(20))  # web | whatsapp
    result: Mapped[str | None] = mapped_column(Text)

    contact: Mapped[Contact | None] = relationship()


class MailAccount(Base):
    """Boîte e-mail connectée d'un commerce (une par commerce pour l'instant)."""

    __tablename__ = "mail_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), unique=True)
    provider: Mapped[str] = mapped_column(String(20), default="gmail")
    email: Mapped[str] = mapped_column(String(255))
    refresh_token_enc: Mapped[str] = mapped_column(Text)  # chiffré (Fernet), jamais en clair
    scopes: Mapped[str] = mapped_column(Text, default="")
    label_id: Mapped[str | None] = mapped_column(String(120))  # libellé « Zunqoo » dans Gmail
    connected_at: Mapped[datetime] = mapped_column(default=_now)
    connected_by: Mapped[str | None] = mapped_column(String(255))
    last_sync_at: Mapped[datetime | None] = mapped_column()
    last_error: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class MailMessage(Base):
    """Un e-mail reçu déjà vu par l'assistant (évite tout double traitement)."""

    __tablename__ = "mail_messages"
    __table_args__ = (UniqueConstraint("tenant_id", "provider_id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    provider_id: Mapped[str] = mapped_column(String(120))  # id Gmail du message
    thread_id: Mapped[str | None] = mapped_column(String(120))
    from_email: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(default=_now)
    category: Mapped[str | None] = mapped_column(String(40))
    importance: Mapped[str | None] = mapped_column(String(20))
    # ignore | lu | a_valider | envoye_auto | envoye | refuse | erreur
    status: Mapped[str] = mapped_column(String(20), default="lu")
    interaction_id: Mapped[str | None] = mapped_column(String(32))
    approval_id: Mapped[str | None] = mapped_column(String(32))
    error: Mapped[str | None] = mapped_column(Text)


class BusinessSettings(Base):
    """Informations légales et réglages des documents (devis, factures)."""

    __tablename__ = "business_settings"
    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    legal_name: Mapped[str | None] = mapped_column(String(200))   # raison sociale
    legal_form: Mapped[str | None] = mapped_column(String(80))    # SARL, EI, SAS…
    address: Mapped[str | None] = mapped_column(String(255))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    city: Mapped[str | None] = mapped_column(String(120))
    siret: Mapped[str | None] = mapped_column(String(20))
    vat_number: Mapped[str | None] = mapped_column(String(20))    # FR + 11 chiffres
    rcs: Mapped[str | None] = mapped_column(String(120))          # « RCS Romans 123 456 789 »
    capital: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    iban: Mapped[str | None] = mapped_column(String(40))
    bic: Mapped[str | None] = mapped_column(String(20))
    # Franchise en base de TVA (art. 293 B du CGI) : pas de TVA facturée.
    vat_franchise: Mapped[bool] = mapped_column(Boolean, default=False)
    quote_validity_days: Mapped[int] = mapped_column(Integer, default=30)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    quote_terms: Mapped[str | None] = mapped_column(Text)    # conditions affichées sur le devis
    invoice_terms: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class DocumentCounter(Base):
    """Compteur de numérotation continue par commerce, type et année."""

    __tablename__ = "document_counters"
    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), primary_key=True)  # DEV | FAC | AV
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last: Mapped[int] = mapped_column(Integer, default=0)


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (UniqueConstraint("tenant_id", "number"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    number: Mapped[str | None] = mapped_column(String(30))  # attribué à l'envoi
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id"))
    # brouillon | a_valider | envoye | accepte | refuse | expire | facture
    status: Mapped[str] = mapped_column(String(20), default="brouillon", index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    lines: Mapped[list[dict]] = mapped_column(JSON, default=list)
    prices_include_vat: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)        # visibles par le client
    internal_notes: Mapped[str | None] = mapped_column(Text)
    issue_date: Mapped[datetime | None] = mapped_column()
    valid_until: Mapped[datetime | None] = mapped_column()
    source: Mapped[str] = mapped_column(String(20), default="manuel")  # manuel | email | appel
    source_mail_id: Mapped[str | None] = mapped_column(String(32))
    email_body: Mapped[str | None] = mapped_column(Text)   # message d'accompagnement
    total_ht: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal(0))
    total_ttc: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal(0))
    sent_at: Mapped[datetime | None] = mapped_column()
    reminders_sent: Mapped[int] = mapped_column(Integer, default=0)
    decided_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    contact: Mapped[Contact | None] = relationship()


@lru_cache(maxsize=4)
def get_engine(url: str) -> Engine:
    if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False}
                           if url.startswith("sqlite") else {})
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _pragma(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")  # worker et API écrivent en parallèle
            cur.close()
    Base.metadata.create_all(engine)
    return engine


@lru_cache(maxsize=4)
def _sessionmaker(url: str) -> sessionmaker[Session]:
    return sessionmaker(get_engine(url), expire_on_commit=False)


@contextmanager
def session_scope(url: str) -> Iterator[Session]:
    session = _sessionmaker(url)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
