"""Outils éditeur : clés et licences.

    zunqoo-license keygen
    zunqoo-license issue --customer "Rôtisserie Dupont" --tenant rotisserie-dupont \\
        --updates-until 2027-10-31 > licence.txt
    zunqoo-license verify licence.txt
"""

from __future__ import annotations

import argparse
import uuid
from datetime import date
from pathlib import Path

from ..core.config import get_settings
from .license import License, generate_keypair, sign_license, verify_license


def main() -> None:
    parser = argparse.ArgumentParser(description="Gestion des licences Zunqoo Voice")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("keygen")
    issue = sub.add_parser("issue")
    issue.add_argument("--customer", required=True)
    issue.add_argument("--tenant", action="append", default=[])
    issue.add_argument("--max-tenants", type=int, default=1)
    issue.add_argument("--updates-until", type=date.fromisoformat)
    issue.add_argument("--expires-at", type=date.fromisoformat)
    verify = sub.add_parser("verify")
    verify.add_argument("file", type=Path)
    args = parser.parse_args()
    settings = get_settings()

    if args.cmd == "keygen":
        priv, pub = generate_keypair()
        print(f"LICENSE_PRIVATE_KEY={priv}   # à garder secret (éditeur uniquement)")
        print(f"LICENSE_PUBLIC_KEY={pub}")
    elif args.cmd == "issue":
        lic = License(
            license_id=str(uuid.uuid4()), customer=args.customer, tenant_ids=args.tenant,
            max_tenants=args.max_tenants, issued_at=date.today(),
            updates_until=args.updates_until, expires_at=args.expires_at,
        )
        print(sign_license(lic, settings.license_private_key.get_secret_value()))
    else:
        lic = verify_license(args.file.read_text(), settings.license_public_key)
        print(lic.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
