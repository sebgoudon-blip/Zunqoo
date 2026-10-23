"""Appels LLM « hors temps réel » avec sortie JSON validée par Pydantic.

Utilisé par l'onboarding (site web -> BusinessProfile) et l'analyse
post-appel (transcription -> CallReport). Les deux fournisseurs utilisent
leur mode de sortie structurée natif : le JSON renvoyé respecte le schéma,
pas besoin de parser du texte libre.
"""

from __future__ import annotations

from typing import Literal, TypeVar

import anthropic
import openai
from pydantic import BaseModel

from .config import Settings

T = TypeVar("T", bound=BaseModel)

Effort = Literal["low", "medium", "high"]
Purpose = Literal["onboarding", "report", "draft"]


class StructuredLLMError(RuntimeError):
    pass


class StructuredLLM:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.provider = settings.llm_provider
        if self.provider == "anthropic":
            self._anthropic = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key.get_secret_value() or None
            )
        else:
            self._openai = openai.AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value() or None
            )

    async def extract(
        self,
        schema: type[T],
        *,
        system: str,
        user: str,
        effort: Effort = "medium",
        purpose: Purpose = "onboarding",
    ) -> T:
        s = self.settings
        if self.provider == "anthropic":
            model = {"report": s.anthropic_report_model, "draft": s.anthropic_chat_model}.get(
                purpose, s.anthropic_extract_model)
            return await self._extract_anthropic(
                schema, model=model, system=system, user=user, effort=effort
            )
        model = {"report": s.openai_report_model, "draft": s.openai_chat_model}.get(
            purpose, s.openai_extract_model)
        return await self._extract_openai(schema, model=model, system=system, user=user)

    async def _extract_anthropic(
        self, schema: type[T], *, model: str, system: str, user: str, effort: Effort
    ) -> T:
        try:
            response = await self._anthropic.messages.parse(
                model=model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=schema,
                output_config={"effort": effort},
            )
        except anthropic.RateLimitError as exc:
            raise StructuredLLMError("Anthropic: limite de débit atteinte") from exc
        except anthropic.APIStatusError as exc:
            raise StructuredLLMError(f"Anthropic: erreur {exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:
            raise StructuredLLMError("Anthropic: connexion impossible") from exc

        if response.stop_reason == "refusal":
            raise StructuredLLMError("Anthropic: requête refusée par le modèle")
        if response.stop_reason == "max_tokens":
            raise StructuredLLMError("Anthropic: sortie tronquée (max_tokens)")
        if response.parsed_output is None:
            raise StructuredLLMError("Anthropic: pas de sortie structurée")
        return response.parsed_output

    async def _extract_openai(
        self, schema: type[T], *, model: str, system: str, user: str
    ) -> T:
        try:
            completion = await self._openai.chat.completions.parse(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format=schema,
                temperature=0,
            )
        except openai.APIError as exc:
            raise StructuredLLMError(f"OpenAI: {exc}") from exc
        message = completion.choices[0].message
        if message.parsed is None:
            raise StructuredLLMError(f"OpenAI: pas de sortie structurée ({message.refusal})")
        return message.parsed
