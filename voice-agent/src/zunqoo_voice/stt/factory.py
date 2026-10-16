"""Speech-to-Text Deepgram en streaming, réglé pour le français au téléphone."""

from __future__ import annotations

from livekit.plugins import deepgram

from ..core.config import Settings
from ..core.models import TenantConfig


def _vocabulary(tenant: TenantConfig) -> list[str]:
    """Noms propres et produits du tenant : améliore la reconnaissance
    ("poulet fermier Label Rouge", nom du marché…)."""
    p = tenant.profile
    words = [p.name, *(x.name for x in p.products), *(m.place for m in p.market_presence)]
    return [w for w in dict.fromkeys(words) if w][:50]


def build_stt(settings: Settings, tenant: TenantConfig) -> deepgram.STT:
    vocab = _vocabulary(tenant)
    extra: dict = {}
    if settings.deepgram_model.startswith("nova-3"):
        extra["keyterm"] = vocab           # nova-3 : keyterm prompting
    elif vocab:
        extra["keywords"] = [(w, 1.5) for w in vocab]  # nova-2 : keyword boosting
    return deepgram.STT(
        model=settings.deepgram_model,
        language="fr",
        api_key=settings.deepgram_api_key.get_secret_value() or None,
        interim_results=True,   # transcriptions partielles -> génération anticipée
        punctuate=True,
        smart_format=True,
        filler_words=True,      # "euh", "ben" : aide la détection de fin de tour
        endpointing_ms=25,
        **extra,
    )
