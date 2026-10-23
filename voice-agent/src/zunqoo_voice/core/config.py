"""Configuration plateforme (variables d'environnement).

Tout ce qui est propre à un commerçant (numéro WhatsApp du gérant, voix,
catalogue…) vit dans sa fiche tenant, pas ici. Ici on ne trouve que les
secrets et réglages de la plateforme qui héberge les tenants.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Déploiement -------------------------------------------------------
    deployment_mode: Literal["saas", "onprem"] = "saas"
    tenants_dir: Path = Path("data/tenants")
    calls_dir: Path = Path("data/calls")  # archive des appels (transcription + compte-rendu)
    default_tenant_id: str | None = None  # utile en one-shot mono-commerce
    admin_api_token: SecretStr = SecretStr("")  # protège l'API d'administration

    # --- CRM ---------------------------------------------------------------
    database_url: str = "sqlite:///data/crm.sqlite3"
    # Clé de signature des sessions du CRM : openssl rand -hex 32
    session_secret: SecretStr = SecretStr("")
    session_hours: int = 12
    # Adresse publique du CRM (liens dans les messages WhatsApp)
    crm_public_url: str = "http://localhost:5174"
    # Webhook WhatsApp (boutons Valider / Refuser)
    whatsapp_app_secret: SecretStr = SecretStr("")    # signature X-Hub-Signature-256
    whatsapp_verify_token: SecretStr = SecretStr("")  # vérification initiale par Meta
    whatsapp_approval_template: str = "zunqoo_validation"

    # --- LiveKit (orchestration temps réel + SIP) --------------------------
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = ""
    livekit_api_secret: SecretStr = SecretStr("")
    livekit_agent_name: str = "zunqoo-voice"

    # --- STT ---------------------------------------------------------------
    deepgram_api_key: SecretStr = SecretStr("")
    deepgram_model: str = "nova-2"  # "nova-3" est disponible et meilleur en FR

    # --- LLM ---------------------------------------------------------------
    llm_provider: Literal["anthropic", "openai"] = "anthropic"
    anthropic_api_key: SecretStr = SecretStr("")
    openai_api_key: SecretStr = SecretStr("")
    # Modèle de conversation (latence critique) et modèle d'extraction (offline).
    anthropic_chat_model: str = "claude-sonnet-5-5"
    # Onboarding (lecture du site, une fois par commerce) : le plus précis.
    anthropic_extract_model: str = "claude-opus-5-5"
    # Compte-rendu d'appel (à chaque appel) : rapide et ~40x moins cher.
    anthropic_report_model: str = "claude-haiku-5-5"
    openai_chat_model: str = "gpt-4o"
    openai_extract_model: str = "gpt-4o"
    openai_report_model: str = "gpt-4o-mini"

    # --- TTS ---------------------------------------------------------------
    tts_provider: Literal["elevenlabs", "cartesia"] = "cartesia"
    elevenlabs_api_key: SecretStr = SecretStr("")
    elevenlabs_model: str = "eleven_turbo_v2_5"
    elevenlabs_default_voice_id: str = ""
    cartesia_api_key: SecretStr = SecretStr("")
    cartesia_model: str = "sonic-3"
    cartesia_default_voice_id: str = ""

    # --- WhatsApp Cloud API (compte plateforme par défaut) -----------------
    whatsapp_api_version: str = "v21.0"
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: SecretStr = SecretStr("")
    # Template approuvé par Meta, requis hors fenêtre de 24 h.
    whatsapp_template_name: str = "zunqoo_call_report"
    whatsapp_template_lang: str = "fr"

    # --- Licences / facturation --------------------------------------------
    license_public_key: str = ""   # Ed25519, base64 — vérification hors-ligne
    license_private_key: SecretStr = SecretStr("")  # uniquement côté éditeur
    license_file: Path | None = None  # mode onprem
    stripe_secret_key: SecretStr = SecretStr("")
    usage_db_path: Path = Path("data/usage.sqlite3")

    # --- Comportement conversationnel --------------------------------------
    max_call_duration_s: int = Field(default=600, ge=60)
    # "model" : détecteur de fin de tour sémantique LiveKit (multilingue, FR inclus)
    # "vad"   : silence seul (plus simple, un peu moins naturel)
    turn_detector: Literal["model", "vad"] = "model"
    thinking_sounds: bool = True  # léger bruit de clavier pendant les appels d'outils
    scraper_max_pages: int = Field(default=25, ge=1, le=200)


@lru_cache
def get_settings() -> Settings:
    return Settings()
