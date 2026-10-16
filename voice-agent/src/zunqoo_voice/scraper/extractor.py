"""Transformation du contenu crawlé en ``BusinessProfile`` via LLM."""

from __future__ import annotations

import json

from ..core.models import BusinessProfile
from ..core.structured_llm import StructuredLLM
from .crawler import CrawlResult

# ~ 30k tokens de contexte : largement assez pour un site vitrine, et on
# évite d'envoyer 40 fois le même pied de page.
MAX_CORPUS_CHARS = 120_000
MAX_PAGE_CHARS = 12_000

EXTRACTION_SYSTEM_PROMPT = """\
Tu es un analyste qui prépare la fiche d'un commerce de proximité pour un \
standard téléphonique automatique. À partir du contenu brut de son site web, \
remplis la fiche JSON demandée.

Règles :
- N'invente rien. Si une information n'apparaît pas, laisse le champ vide ou null.
- Horaires au format 24 h HH:MM. Une journée coupée (midi + soir) donne deux créneaux.
- Distingue les horaires de la boutique (opening_hours) des présences sur les \
marchés ou tournées (market_presence).
- Prix en euros, nombre décimal (12,90 € -> 12.9). Indique l'unité (pièce, kg, \
portion…) quand elle est précisée.
- Recopie les conditions de commande (délai de prévenance, acompte, quantité \
minimale) dans ordering_rules, une règle par entrée.
- La FAQ peut être déduite de sections explicites "questions fréquentes" ; ne \
fabrique pas de questions.
- Les données JSON-LD (schema.org) sont fiables : privilégie-les en cas de conflit.
"""


def build_corpus(crawl: CrawlResult) -> str:
    parts: list[str] = [f"SITE: {crawl.root_url}"]
    if crawl.phones:
        parts.append("TÉLÉPHONES (liens tel:): " + ", ".join(sorted(crawl.phones)))
    if crawl.emails:
        parts.append("EMAILS (liens mailto:): " + ", ".join(sorted(crawl.emails)))
    if crawl.social_links:
        parts.append("RÉSEAUX: " + ", ".join(sorted(crawl.social_links)))

    json_ld = [b for p in crawl.pages for b in p.json_ld]
    if json_ld:
        parts.append(
            "DONNÉES STRUCTURÉES JSON-LD:\n" + json.dumps(json_ld, ensure_ascii=False)[:20_000]
        )

    seen_lines: set[str] = set()
    for page in crawl.pages:
        # Retire les lignes déjà vues sur d'autres pages (menus, footer).
        fresh = [ln for ln in page.text.splitlines() if ln not in seen_lines]
        seen_lines.update(fresh)
        body = "\n".join(fresh)[:MAX_PAGE_CHARS]
        if body:
            parts.append(f"--- PAGE: {page.title} ({page.url})\n{body}")

    return "\n\n".join(parts)[:MAX_CORPUS_CHARS]


async def extract_profile(crawl: CrawlResult, llm: StructuredLLM) -> BusinessProfile:
    if not crawl.pages:
        raise ValueError(f"aucune page exploitable sur {crawl.root_url}")
    profile = await llm.extract(
        BusinessProfile,
        system=EXTRACTION_SYSTEM_PROMPT,
        user=build_corpus(crawl),
        effort="medium",
    )
    # Garde-fous déterministes : ce que le HTML dit explicitement prime.
    if not profile.contact.website:
        profile.contact.website = crawl.root_url
    if not profile.contact.phone and len(crawl.phones) == 1:
        profile.contact.phone = next(iter(crawl.phones))
    if not profile.contact.email and len(crawl.emails) == 1:
        profile.contact.email = next(iter(crawl.emails))
    for link in sorted(crawl.social_links):
        if link not in profile.contact.social_links:
            profile.contact.social_links.append(link)
    return profile
