"""Client minimal WhatsApp Business Cloud API (Meta Graph API)."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com"

# Codes d'erreur Meta utiles :
# 131047 : hors fenêtre de 24 h -> template obligatoire
# 132001 : template inexistant / pas encore approuvé
# 132018 : variable de template invalide (retour à la ligne…)
REENGAGEMENT_REQUIRED = 131047


class WhatsAppError(RuntimeError):
    def __init__(self, status: int, code: int | None, message: str) -> None:
        super().__init__(f"WhatsApp {status} (code {code}): {message}")
        self.status = status
        self.code = code


@dataclass
class WhatsAppCredentials:
    phone_number_id: str
    access_token: str
    api_version: str = "v21.0"


class WhatsAppClient:
    def __init__(
        self,
        creds: WhatsAppCredentials,
        *,
        http: httpx.AsyncClient | None = None,
        max_retries: int = 3,
    ) -> None:
        self.creds = creds
        self._http = http or httpx.AsyncClient(timeout=15)
        self._owns_http = http is None
        self.max_retries = max_retries

    @property
    def _endpoint(self) -> str:
        return f"{GRAPH_URL}/{self.creds.api_version}/{self.creds.phone_number_id}/messages"

    async def aclose(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def send_text(self, to: str, body: str) -> str:
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"preview_url": False, "body": body[:4096]},
            }
        )

    async def send_template(self, to: str, name: str, lang: str, params: list[str]) -> str:
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "template",
                "template": {
                    "name": name,
                    "language": {"code": lang},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [{"type": "text", "text": p} for p in params],
                        }
                    ],
                },
            }
        )

    async def send_template_with_buttons(
        self, to: str, name: str, lang: str, params: list[str], button_payloads: list[str]
    ) -> str:
        """Template avec boutons « réponse rapide » : le payload revient au webhook."""
        components: list[dict] = [
            {"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}
        ]
        components += [
            {"type": "button", "sub_type": "quick_reply", "index": str(i),
             "parameters": [{"type": "payload", "payload": payload}]}
            for i, payload in enumerate(button_payloads)
        ]
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "template",
                "template": {"name": name, "language": {"code": lang}, "components": components},
            }
        )

    async def send_buttons(self, to: str, body: str, buttons: list[tuple[str, str]]) -> str:
        """Message interactif (fenêtre de 24 h) : jusqu'à 3 boutons (id, libellé ≤ 20 car.)."""
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body[:1024]},
                    "action": {
                        "buttons": [
                            {"type": "reply", "reply": {"id": bid, "title": title[:20]}}
                            for bid, title in buttons[:3]
                        ]
                    },
                },
            }
        )

    async def _post(self, payload: dict) -> str:
        headers = {"Authorization": f"Bearer {self.creds.access_token}"}
        for attempt in range(self.max_retries + 1):
            try:
                resp = await self._http.post(self._endpoint, json=payload, headers=headers)
            except httpx.TransportError as exc:
                if attempt == self.max_retries:
                    raise WhatsAppError(0, None, str(exc)) from exc
                await asyncio.sleep(2**attempt)
                continue

            if resp.status_code == 200:
                return resp.json()["messages"][0]["id"]

            if (resp.status_code == 429 or resp.status_code >= 500) and attempt < self.max_retries:
                await asyncio.sleep(2**attempt)
                continue

            try:
                err = resp.json().get("error", {})
            except ValueError:
                err = {}
            raise WhatsAppError(resp.status_code, err.get("code"), err.get("message", resp.text))
        raise AssertionError("unreachable")
