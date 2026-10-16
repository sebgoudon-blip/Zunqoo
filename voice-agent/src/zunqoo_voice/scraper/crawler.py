"""Crawler léger d'un site vitrine.

Objectif : récupérer en quelques secondes tout le texte utile d'un site de
commerce (accueil, carte, horaires, contact, mentions…), plus les signaux
déjà structurés que beaucoup de sites exposent (JSON-LD schema.org,
liens tel:/mailto:). On reste sur le même domaine, on respecte robots.txt
et on visite en priorité les pages dont l'URL ressemble à une page métier.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

USER_AGENT = "ZunqooVoiceBot/0.1 (+https://zunqoo.com/bot; merchant onboarding)"

# Pages métier à visiter en premier (score plus haut = visité plus tôt).
_PRIORITY_HINTS = {
    "contact": 10, "horaire": 10, "hours": 9, "carte": 9, "menu": 9, "tarif": 9,
    "prix": 8, "produit": 8, "boutique": 7, "commande": 8, "order": 7,
    "livraison": 8, "marche": 8, "marché": 8, "tournee": 7, "faq": 8,
    "question": 6, "propos": 5, "about": 5, "traiteur": 6, "rotisserie": 6,
    "info": 4, "acces": 5, "plan": 3,
}
_SKIP_EXT = re.compile(
    r"\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|webm|css|js|woff2?|ttf|xml)$", re.IGNORECASE
)
_SKIP_PATH = re.compile(r"/(wp-admin|wp-json|cart|panier|checkout|account|login|feed)\b", re.IGNORECASE)


@dataclass
class Page:
    url: str
    title: str
    text: str
    json_ld: list[dict] = field(default_factory=list)


@dataclass
class CrawlResult:
    root_url: str
    pages: list[Page]
    phones: set[str] = field(default_factory=set)
    emails: set[str] = field(default_factory=set)
    social_links: set[str] = field(default_factory=set)


def _score(url: str) -> int:
    path = urlparse(url).path.lower()
    return sum(w for hint, w in _PRIORITY_HINTS.items() if hint in path) - path.count("/")


def _clean_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "form"]):
        tag.decompose()
    # On garde header/footer : les horaires et le téléphone y sont souvent.
    text = soup.get_text("\n", strip=True)
    lines, seen = [], set()
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) < 2 or line in seen:  # dédoublonne menus répétés
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines)


def _extract_json_ld(soup: BeautifulSoup) -> list[dict]:
    blocks: list[dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        blocks.extend(i for i in items if isinstance(i, dict))
    return blocks


class SiteCrawler:
    def __init__(self, max_pages: int = 25, concurrency: int = 4, timeout_s: float = 15) -> None:
        self.max_pages = max_pages
        self.concurrency = concurrency
        self.timeout_s = timeout_s

    async def crawl(self, url: str) -> CrawlResult:
        if not urlparse(url).scheme:
            url = "https://" + url
        root = urlparse(url)
        host = root.netloc.removeprefix("www.")

        async with httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9"},
            follow_redirects=True,
            timeout=self.timeout_s,
        ) as client:
            robots = await self._load_robots(client, f"{root.scheme}://{root.netloc}/robots.txt")
            result = CrawlResult(root_url=url, pages=[])
            queue: list[str] = [url]
            seen: set[str] = {url}
            sem = asyncio.Semaphore(self.concurrency)

            async def fetch(u: str) -> tuple[str, str | None]:
                async with sem:
                    try:
                        resp = await client.get(u)
                    except httpx.HTTPError as exc:
                        log.warning("échec %s: %s", u, exc)
                        return u, None
                    if resp.status_code != 200 or "html" not in resp.headers.get(
                        "content-type", ""
                    ):
                        return u, None
                    return str(resp.url), resp.text

            while queue and len(result.pages) < self.max_pages:
                queue.sort(key=_score, reverse=True)
                batch_size = min(self.concurrency, self.max_pages - len(result.pages))
                batch, queue = queue[:batch_size], queue[batch_size:]
                for final_url, html in await asyncio.gather(*(fetch(u) for u in batch)):
                    if html is None:
                        continue
                    soup = BeautifulSoup(html, "lxml")
                    for link in self._links(soup, final_url, result):
                        parsed = urlparse(link)
                        if (
                            parsed.netloc.removeprefix("www.") == host
                            and link not in seen
                            and not _SKIP_EXT.search(parsed.path)
                            and not _SKIP_PATH.search(parsed.path)
                            and (robots is None or robots.can_fetch(USER_AGENT, link))
                        ):
                            seen.add(link)
                            queue.append(link)
                    title = soup.title.get_text(strip=True) if soup.title else final_url
                    json_ld = _extract_json_ld(soup)
                    result.pages.append(
                        Page(url=final_url, title=title, text=_clean_text(soup), json_ld=json_ld)
                    )
            log.info("crawl %s: %d pages", url, len(result.pages))
            return result

    @staticmethod
    def _links(soup: BeautifulSoup, base: str, result: CrawlResult) -> list[str]:
        out = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith("tel:"):
                result.phones.add(re.sub(r"[^\d+]", "", href[4:]))
            elif href.startswith("mailto:"):
                result.emails.add(href[7:].split("?")[0])
            elif any(s in href for s in ("facebook.com", "instagram.com", "tiktok.com")):
                result.social_links.add(href)
            elif not href.startswith(("javascript:", "#")):
                out.append(urldefrag(urljoin(base, href))[0])
        return out

    @staticmethod
    async def _load_robots(client: httpx.AsyncClient, robots_url: str) -> RobotFileParser | None:
        try:
            resp = await client.get(robots_url)
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        parser = RobotFileParser()
        parser.parse(resp.text.splitlines())
        return parser
