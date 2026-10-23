"""Routes du CRM : résumé du soir et avis Google."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from ..core.config import Settings, get_settings
from ..crm.api import DB, CurrentUser, require_admin, tenant_of
from ..crm.db import User
from . import reviews  # noqa: F401 - enregistre l'exécuteur « avis_demande »
from .reviews import default_message, poster_pdf, render_message, review_stats
from .summary import build_summary, extras_settings, send_summary

router = APIRouter(prefix="/api/extras")
_HM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ExtrasIn(BaseModel):
    summary_time: str | None = None
    summary_days: list[int] | None = None
    review_link: str | None = Field(default=None, max_length=500)
    review_delay_hours: int | None = Field(default=None, ge=1, le=336)
    review_message: str | None = Field(default=None, max_length=3000)

    @field_validator("summary_time")
    @classmethod
    def _time(cls, v):
        if v is not None and not _HM.match(v):
            raise ValueError("heure invalide (HH:MM)")
        return v

    @field_validator("summary_days")
    @classmethod
    def _days(cls, v):
        if v is not None and any(d not in range(7) for d in v):
            raise ValueError("jour invalide")
        return None if v is None else sorted(set(v))

    @field_validator("review_link")
    @classmethod
    def _link(cls, v):
        v = (v or "").strip()
        if v and not v.startswith("https://"):
            raise ValueError("le lien doit commencer par https://")
        return v or None

    @field_validator("review_message")
    @classmethod
    def _message(cls, v):
        if v and "{lien}" not in v:
            raise ValueError("le message doit contenir {lien}")
        return v or None


def _out(cfg, tenant) -> dict:
    return {"summary_time": cfg.summary_time, "summary_days": cfg.summary_days,
            "summary_last_sent": cfg.summary_last_sent,
            "review_link": cfg.review_link, "review_delay_hours": cfg.review_delay_hours,
            "review_message": cfg.review_message, "default_review_message": default_message(tenant),
            "whatsapp_numbers": len(tenant.whatsapp.manager_numbers)}


@router.get("/settings")
def get_extras(user: CurrentUser, session: DB, settings: Settings = Depends(get_settings)) -> dict:
    return _out(extras_settings(session, user.tenant_id), tenant_of(user, settings))


@router.patch("/settings")
def update_extras(body: ExtrasIn, session: DB, user: User = Depends(require_admin),
                  settings: Settings = Depends(get_settings)) -> dict:
    cfg = extras_settings(session, user.tenant_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    session.flush()
    return _out(cfg, tenant_of(user, settings))


@router.get("/summary/preview")
def preview_summary(user: CurrentUser, session: DB,
                    settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    return {"text": build_summary(session, settings, tenant).text(tenant.profile.name)}


@router.post("/summary/send")
async def send_summary_now(session: DB, user: User = Depends(require_admin),
                           settings: Settings = Depends(get_settings)) -> dict:
    """Envoi immédiat, pour essayer (ne compte pas comme le résumé du jour)."""
    tenant = tenant_of(user, settings)
    if not tenant.whatsapp.manager_numbers:
        raise HTTPException(status_code=400, detail="aucun numéro WhatsApp gérant n'est configuré")
    sent = await send_summary(tenant, build_summary(session, settings, tenant), settings)
    if not sent:
        raise HTTPException(status_code=502, detail="WhatsApp n'a pas accepté l'envoi, réessayez plus tard")
    return {"sent_to": len(sent)}


@router.get("/reviews")
def reviews_overview(user: CurrentUser, session: DB,
                     settings: Settings = Depends(get_settings)) -> dict:
    tenant = tenant_of(user, settings)
    cfg = extras_settings(session, user.tenant_id)
    preview = render_message(cfg.review_message or default_message(tenant), None,
                             cfg.review_link or "https://g.page/r/…/review")
    return {**review_stats(session, user.tenant_id, datetime.now(UTC)), "preview": preview}


@router.get("/reviews/poster.pdf")
def review_poster(user: CurrentUser, session: DB,
                  settings: Settings = Depends(get_settings)) -> Response:
    cfg = extras_settings(session, user.tenant_id)
    if not cfg.review_link:
        raise HTTPException(status_code=400, detail="renseignez d'abord votre lien d'avis Google")
    pdf = poster_pdf(tenant_of(user, settings), cfg.review_link)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="affiche-avis-google.pdf"'})
