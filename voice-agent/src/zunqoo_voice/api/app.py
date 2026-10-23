"""API HTTP de la plateforme.

    uvicorn zunqoo_voice.api.app:app --port 8000

- ``/api/...`` : CRM des commerçants (session utilisateur, voir ``crm/api.py``)
- ``/webhooks/whatsapp`` : clics « Valider / Refuser » envoyés par Meta
- ``/tenants``, ``/billing``, ``/calls`` : administration plateforme
  (``Authorization: Bearer $ADMIN_API_TOKEN``)
"""

from __future__ import annotations

import hmac
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from ..billing.usage import UsageMeter
from ..core.call_archive import CallArchive
from ..core.config import Settings, get_settings
from ..core.models import Plan, TenantConfig
from ..core.tenant_store import FileTenantStore
from ..crm.api import router as crm_router
from ..crm.webhook import router as webhook_router
from ..documents.api import router as documents_router
from ..mail.api import router as mail_router
from ..scraper.onboarding import onboard_from_url

app = FastAPI(title="Zunqoo — API")
app.include_router(crm_router)
app.include_router(webhook_router)
app.include_router(mail_router)
app.include_router(documents_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().crm_public_url.rstrip("/")],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


def require_admin(
    authorization: str = Header(default=""), settings: Settings = Depends(get_settings)
) -> None:
    expected = settings.admin_api_token.get_secret_value()
    token = authorization.removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="token invalide")


class OnboardRequest(BaseModel):
    url: HttpUrl
    tenant_id: str | None = None
    plan: Plan = Plan.SAAS_STARTER
    phone_numbers: list[str] = []
    manager_whatsapp: list[str] = []


@app.post("/tenants/onboard", dependencies=[Depends(require_admin)])
async def onboard(req: OnboardRequest, settings: Settings = Depends(get_settings)) -> dict:
    tenant = await onboard_from_url(
        str(req.url), FileTenantStore(settings.tenants_dir), settings,
        tenant_id=req.tenant_id, plan=req.plan, phone_numbers=req.phone_numbers,
        manager_whatsapp=req.manager_whatsapp,
    )
    return {"tenant_id": tenant.id, "profile": tenant.profile.model_dump(mode="json")}


@app.get("/tenants/{tenant_id}", dependencies=[Depends(require_admin)])
def get_tenant(tenant_id: str, settings: Settings = Depends(get_settings)) -> TenantConfig:
    try:
        tenant = FileTenantStore(settings.tenants_dir).get(tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if tenant is None:
        raise HTTPException(status_code=404, detail="tenant inconnu")
    return tenant


@app.get("/billing/statement", dependencies=[Depends(require_admin)])
def statement(month: str | None = None, settings: Settings = Depends(get_settings)) -> list[dict]:
    month = month or datetime.now().strftime("%Y-%m")
    return UsageMeter(settings.usage_db_path).monthly_statement(month)


@app.get("/calls/{tenant_id}/undelivered", dependencies=[Depends(require_admin)])
def undelivered(
    tenant_id: str, month: str | None = None, settings: Settings = Depends(get_settings)
) -> list[dict]:
    """Appels dont le compte-rendu WhatsApp n'est arrivé chez aucun gérant."""
    month = month or datetime.now().strftime("%Y-%m")
    records = CallArchive(settings.calls_dir).unnotified(tenant_id, month)
    return [r.model_dump(mode="json") for r in records]
