"""Client Google Agenda (API REST v3), limité à ce dont l'agenda a besoin."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

import httpx

from .slots import Busy

API = "https://www.googleapis.com/calendar/v3"


class CalendarError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Google Agenda {status}: {message}")
        self.status = status


def _parse(value: dict) -> datetime | None:
    if "dateTime" in value:
        return datetime.fromisoformat(value["dateTime"])
    return None


class CalendarClient:
    def __init__(self, access_token: str, calendar_id: str = "primary",
                 http: httpx.AsyncClient | None = None) -> None:
        self._token = access_token
        self._cal = quote(calendar_id, safe="")
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
            raise CalendarError(resp.status_code, message[:300])
        return resp.json() if resp.content else {}

    async def busy(self, start: datetime, end: datetime, tz: str) -> list[Busy]:
        """Périodes occupées. Les journées entières (congés, fermetures) bloquent
        toute la journée ; les événements marqués « disponible » ne bloquent rien."""
        out: list[Busy] = []
        page = None
        while True:
            params = {"timeMin": start.isoformat(), "timeMax": end.isoformat(),
                      "singleEvents": "true", "orderBy": "startTime", "timeZone": tz,
                      "maxResults": "250"}
            if page:
                params["pageToken"] = page
            data = await self._call("GET", f"/calendars/{self._cal}/events", params=params)
            for ev in data.get("items", []):
                if ev.get("status") == "cancelled" or ev.get("transparency") == "transparent":
                    continue
                s, e = _parse(ev.get("start", {})), _parse(ev.get("end", {}))
                if s and e:
                    out.append(Busy(s, e))
                elif ev.get("start", {}).get("date"):  # journée entière
                    from zoneinfo import ZoneInfo
                    d0 = datetime.fromisoformat(ev["start"]["date"]).replace(tzinfo=ZoneInfo(tz))
                    d1 = datetime.fromisoformat(ev["end"]["date"]).replace(tzinfo=ZoneInfo(tz))
                    out.append(Busy(d0, d1))
            page = data.get("nextPageToken")
            if not page:
                return out

    async def create(self, *, summary: str, description: str, start: datetime, end: datetime,
                     tz: str, location: str | None, zunqoo_id: str, tentative: bool) -> str:
        body = {
            "summary": summary, "description": description,
            "start": {"dateTime": start.isoformat(), "timeZone": tz},
            "end": {"dateTime": end.isoformat(), "timeZone": tz},
            "status": "tentative" if tentative else "confirmed",
            "extendedProperties": {"private": {"zunqoo_id": zunqoo_id}},
            "reminders": {"useDefault": True},
        }
        if location:
            body["location"] = location
        return (await self._call("POST", f"/calendars/{self._cal}/events", json=body))["id"]

    async def update(self, event_id: str, **fields) -> None:
        await self._call("PATCH", f"/calendars/{self._cal}/events/{quote(event_id, safe='')}",
                         json=fields)

    async def delete(self, event_id: str) -> None:
        try:
            await self._call("DELETE", f"/calendars/{self._cal}/events/{quote(event_id, safe='')}")
        except CalendarError as exc:
            if exc.status not in (404, 410):  # déjà supprimé : rien à faire
                raise
