"""Analyse post-appel : transcription -> ``CallReport`` structuré."""

from __future__ import annotations

from datetime import datetime

from ..core.models import CallReport, TenantConfig
from ..core.structured_llm import StructuredLLM
from .prompts import spoken_datetime

ANALYSIS_SYSTEM_PROMPT = """\
Tu analyses la transcription d'un appel téléphonique reçu par un commerce, pour \
en faire un compte-rendu destiné au gérant.

Règles :
- Base-toi uniquement sur ce que le client a dit et ce qui a été confirmé dans l'appel.
- Si une commande a été confirmée par l'outil enregistrer_commande, ses données \
font foi ; sinon reconstitue-la depuis la conversation.
- Les quantités sont des nombres (« deux poulets » -> 2). Le nom des produits suit \
celui du catalogue quand c'est clair.
- customer_phone : le numéro donné à l'oral par le client, ou celui de l'appelant \
s'il l'a confirmé. Format chiffres uniquement.
- requested_day reprend la formulation du client (« samedi matin »). requested_date \
est la date ISO correspondante calculée à partir de la date de l'appel, seulement si \
elle est sans ambiguïté.
- customer_notes : les demandes particulières, entre guillemets si possible mot pour mot.
- summary : une ou deux phrases, factuelles, utiles au gérant.
- needs_callback : vrai si le client attend un rappel ou si une question est restée \
sans réponse.
"""


async def analyze_call(
    transcript: str,
    tenant: TenantConfig,
    *,
    llm: StructuredLLM,
    call_time: datetime,
    caller_number: str | None,
    confirmed_order: dict | None = None,
) -> CallReport:
    catalog = ", ".join(p.name for p in tenant.profile.products) or "non renseigné"
    header = [
        f"Commerce : {tenant.profile.name}",
        f"Date de l'appel : {spoken_datetime(call_time)} ({call_time.date().isoformat()})",
        f"Numéro de l'appelant : {caller_number or 'masqué'}",
        f"Catalogue : {catalog}",
    ]
    if confirmed_order:
        header.append(f"Commande confirmée via l'outil : {confirmed_order}")
    user = "\n".join(header) + "\n\nTRANSCRIPTION :\n" + transcript
    return await llm.extract(CallReport, system=ANALYSIS_SYSTEM_PROMPT, user=user, effort="low")
