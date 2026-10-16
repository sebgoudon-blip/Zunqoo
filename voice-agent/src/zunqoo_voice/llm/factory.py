"""LLM de conversation temps réel (plugin LiveKit)."""

from __future__ import annotations

from livekit.agents import llm as lk_llm
from livekit.plugins import anthropic, openai

from ..core.config import Settings


def build_chat_llm(settings: Settings) -> lk_llm.LLM:
    if settings.llm_provider == "anthropic":
        return anthropic.LLM(
            model=settings.anthropic_chat_model,
            api_key=settings.anthropic_api_key.get_secret_value() or None,
            # Réponses orales courtes : inutile de réserver beaucoup de tokens.
            max_tokens=400,
            caching="ephemeral",
        )
    return openai.LLM(
        model=settings.openai_chat_model,
        api_key=settings.openai_api_key.get_secret_value() or None,
        temperature=0.6,
        max_completion_tokens=400,
    )
