"""Client Gmail API (REST) et lecture / écriture des messages MIME."""

from __future__ import annotations

import base64
import html
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formataddr, getaddresses, make_msgid, parseaddr

import httpx

API = "https://gmail.googleapis.com/gmail/v1/users/me"
LABEL_NAME = "Zunqoo"

# Expéditeurs qui n'attendent jamais de réponse.
_NO_REPLY = re.compile(r"(^|[._-])(no-?reply|ne-?pas-?repondre|mailer-daemon|notifications?)@",
                       re.IGNORECASE)


class GmailError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Gmail {status}: {message}")
        self.status = status


@dataclass
class InboundMail:
    id: str
    thread_id: str
    from_name: str
    from_email: str
    to: list[str]
    subject: str
    date: datetime
    text: str
    message_id: str | None
    references: str | None
    is_bulk: bool  # newsletter, notification automatique…
    label_ids: list[str] = field(default_factory=list)

    @property
    def is_no_reply(self) -> bool:
        return bool(_NO_REPLY.search(self.from_email))


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style|head).*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(raw)
    text = re.sub(r"[ \t ]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def strip_quoted(text: str) -> str:
    """Retire l'historique cité (« Le … a écrit : », lignes en >) d'une réponse."""
    lines = []
    for line in text.splitlines():
        if re.match(r"^\s*(Le .{5,120} a écrit\s*:|On .{5,120} wrote:|-{2,}\s*Original|De\s*:.+@)",
                    line, re.IGNORECASE):
            break
        if line.lstrip().startswith(">"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _extract_body(payload: dict) -> str:
    """Préfère text/plain ; à défaut convertit text/html. Ignore les pièces jointes."""
    plain: list[str] = []
    htmls: list[str] = []

    def walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        if part.get("filename"):
            return
        data = part.get("body", {}).get("data")
        if data and mime == "text/plain":
            plain.append(_b64decode(data).decode("utf-8", errors="replace"))
        elif data and mime == "text/html":
            htmls.append(_b64decode(data).decode("utf-8", errors="replace"))
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    if plain:
        return "\n".join(plain).strip()
    return html_to_text("\n".join(htmls))


def parse_message(msg: dict) -> InboundMail:
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    name, addr = parseaddr(headers.get("from", ""))
    internal = int(msg.get("internalDate", "0")) / 1000
    bulk = bool(headers.get("list-unsubscribe") or headers.get("list-id")
                or headers.get("precedence", "").lower() in ("bulk", "list", "junk")
                or headers.get("auto-submitted", "no").lower() != "no")
    return InboundMail(
        id=msg["id"],
        thread_id=msg.get("threadId", msg["id"]),
        from_name=name,
        from_email=addr.lower(),
        to=[a for _, a in getaddresses([headers.get("to", "")]) if a],
        subject=headers.get("subject", "(sans objet)"),
        date=datetime.fromtimestamp(internal, UTC) if internal else datetime.now(UTC),
        text=strip_quoted(_extract_body(msg.get("payload", {})))[:20_000],
        message_id=headers.get("message-id"),
        references=headers.get("references"),
        is_bulk=bulk,
        label_ids=msg.get("labelIds", []),
    )


def build_reply(original: InboundMail, *, from_email: str, from_name: str, body: str) -> dict:
    """Réponse dans le même fil Gmail (In-Reply-To / References / threadId)."""
    m = EmailMessage()
    m["From"] = formataddr((from_name, from_email))
    m["To"] = formataddr((original.from_name, original.from_email))
    subject = original.subject
    m["Subject"] = subject if re.match(r"(?i)^(re|rép|réf)\s*:", subject) else f"Re: {subject}"
    m["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    if original.message_id:
        m["In-Reply-To"] = original.message_id
        m["References"] = f"{original.references or ''} {original.message_id}".strip()
    m.set_content(body)
    raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
    return {"raw": raw, "threadId": original.thread_id}


class GmailClient:
    def __init__(self, access_token: str, http: httpx.AsyncClient | None = None) -> None:
        self._token = access_token
        self._http = http or httpx.AsyncClient(timeout=20)
        self._owns = http is None

    async def aclose(self) -> None:
        if self._owns:
            await self._http.aclose()

    async def _call(self, method: str, path: str, **kw) -> dict:
        resp = await self._http.request(method, f"{API}{path}",
                                        headers={"Authorization": f"Bearer {self._token}"}, **kw)
        if resp.status_code >= 400:
            try:
                message = resp.json().get("error", {}).get("message", resp.text)
            except ValueError:
                message = resp.text
            raise GmailError(resp.status_code, message[:300])
        return resp.json() if resp.content else {}

    async def profile(self) -> dict:
        return await self._call("GET", "/profile")

    async def list_new(self, *, label_id: str | None, max_results: int) -> list[str]:
        # Boîte de réception, 3 derniers jours, hors promotions/réseaux sociaux,
        # pas encore marqués par Zunqoo.
        query = "in:inbox newer_than:3d -category:promotions -category:social"
        if label_id:
            query += f" -label:{LABEL_NAME}"
        data = await self._call("GET", "/messages", params={"q": query, "maxResults": max_results})
        return [m["id"] for m in data.get("messages", [])]

    async def get(self, message_id: str) -> InboundMail:
        return parse_message(await self._call("GET", f"/messages/{message_id}",
                                              params={"format": "full"}))

    async def ensure_label(self) -> str:
        labels = await self._call("GET", "/labels")
        for label in labels.get("labels", []):
            if label["name"] == LABEL_NAME:
                return label["id"]
        created = await self._call("POST", "/labels", json={
            "name": LABEL_NAME, "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
        })
        return created["id"]

    async def add_label(self, message_id: str, label_id: str) -> None:
        await self._call("POST", f"/messages/{message_id}/modify",
                         json={"addLabelIds": [label_id]})

    async def send(self, message: dict) -> str:
        return (await self._call("POST", "/messages/send", json=message))["id"]
