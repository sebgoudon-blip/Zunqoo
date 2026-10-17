from datetime import date, datetime

import pytest

from zunqoo_voice.billing.license import (
    License,
    LicenseError,
    generate_keypair,
    sign_license,
    verify_license,
)
from zunqoo_voice.core.tenant_store import FileTenantStore, normalize_number
from zunqoo_voice.llm.prompts import build_greeting, build_system_prompt
from zunqoo_voice.llm.tools import planning_for_day
from zunqoo_voice.telephony.routing import resolve_tenant


@pytest.mark.parametrize("raw,expected", [
    ("06 12 34 56 78", "+33612345678"),
    ("0033612345678", "+33612345678"),
    ("sip:+33187000000@trunk.example", "+33187000000"),
    ("33187000000", "+33187000000"),
])
def test_normalize_number(raw, expected):
    assert normalize_number(raw) == expected


def test_store_roundtrip_and_routing(tmp_path, tenant):
    store = FileTenantStore(tmp_path)
    store.save(tenant)
    assert store.find_by_number("01 87 00 00 00").id == tenant.id
    assert resolve_tenant(store, job_metadata='{"tenant_id": "rotisserie-demo"}',
                          dialed_number=None, default_tenant_id=None).id == tenant.id
    assert resolve_tenant(store, job_metadata=None, dialed_number="+33100000000",
                          default_tenant_id=None) is None
    with pytest.raises(ValueError):
        store.get("../etc/passwd")


def test_prompt_contains_profile_and_rules(tenant):
    prompt = build_system_prompt(tenant, now=datetime(2026, 10, 16, 9, 5),
                                 caller_number="+33612345678")
    assert "Camille" in prompt and "Marché de Vincennes" in prompt
    assert "Jamais de liste" in prompt
    assert prompt.rstrip().endswith("Numéro de l'appelant : +33612345678.")
    assert "vendredi 16 octobre 2026, 9 h 05" in prompt
    assert "Ne prétends jamais être humaine" in prompt


def test_greeting_discloses_ai(tenant):
    assert "assistante vocale" in build_greeting(tenant)


def test_call_archive_tracks_undelivered(tmp_path):
    from zunqoo_voice.core.call_archive import CallArchive
    from zunqoo_voice.core.models import CallRecord

    now = datetime(2026, 10, 17, 10, 0)
    archive = CallArchive(tmp_path)
    rec = [CallRecord(tenant_id="t", call_id=c, started_at=now, ended_at=now, duration_s=60,
                      transcript="Client : bonjour") for c in ("a", "b")]
    for r in rec:
        archive.save(r)
    archive.mark_notified(rec[0], {"336": "wamid"})
    archive.mark_notified(rec[1], {})
    assert [r.call_id for r in archive.unnotified("t", "2026-10")] == ["b"]


def test_planning_for_saturday(tenant):
    out = planning_for_day(tenant, "samedi")
    assert out.startswith("samedi") and "Marché de Vincennes 07:30-13:30" in out
    assert "Fermé" in planning_for_day(tenant, "lundi")


def test_license_sign_verify_and_tamper():
    priv, pub = generate_keypair()
    lic = License(license_id="l1", customer="Dupont", tenant_ids=["rotisserie-demo"],
                  issued_at=date(2026, 1, 1), expires_at=date(2027, 1, 1))
    token = sign_license(lic, priv)
    assert verify_license(token, pub, today=date(2026, 6, 1)).customer == "Dupont"
    with pytest.raises(LicenseError):
        verify_license(token, pub, today=date(2027, 2, 1))
    payload, sig = token.split(".")
    with pytest.raises(LicenseError):
        verify_license(payload[:-2] + "AA." + sig, pub)
