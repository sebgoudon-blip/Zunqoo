import json
from pathlib import Path

import pytest

from zunqoo_voice.core.models import TenantConfig

DATA = Path(__file__).resolve().parents[1] / "data" / "tenants"


@pytest.fixture
def tenant() -> TenantConfig:
    return TenantConfig.model_validate(json.loads((DATA / "rotisserie-demo.json").read_text()))
