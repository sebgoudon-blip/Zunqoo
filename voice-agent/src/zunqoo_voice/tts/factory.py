"""Text-to-Speech en streaming WebSocket (ElevenLabs Turbo v2.5 ou Cartesia)."""

from __future__ import annotations

from livekit.agents import tts as lk_tts
from livekit.plugins import cartesia, elevenlabs

from ..core.config import Settings
from ..core.models import TenantConfig


def build_tts(settings: Settings, tenant: TenantConfig) -> lk_tts.TTS:
    provider = tenant.voice.tts_provider or settings.tts_provider
    if provider == "cartesia":
        return cartesia.TTS(
            api_key=settings.cartesia_api_key.get_secret_value() or None,
            model=settings.cartesia_model,
            voice=tenant.voice.voice_id or settings.cartesia_default_voice_id,
            language="fr",
            speed=tenant.voice.speaking_rate,
        )
    return elevenlabs.TTS(
        api_key=settings.elevenlabs_api_key.get_secret_value() or None,
        model=settings.elevenlabs_model,
        voice_id=tenant.voice.voice_id or settings.elevenlabs_default_voice_id,
        language="fr",
        # Stabilité modérée = intonation vivante sans dérive ; un peu de style
        # pour la chaleur. speed légèrement sous 1 : plus posé au téléphone.
        voice_settings=elevenlabs.VoiceSettings(
            stability=0.45,
            similarity_boost=0.8,
            style=0.2,
            use_speaker_boost=True,
            speed=tenant.voice.speaking_rate or 1.0,
        ),
        # Commence à parler dès les premiers mots générés.
        chunk_length_schedule=[50, 90, 160, 250],
        apply_text_normalization="auto",
    )
