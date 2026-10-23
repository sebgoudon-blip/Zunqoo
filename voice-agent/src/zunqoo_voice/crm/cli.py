"""Commandes d'exploitation du CRM.

    zunqoo-crm create-user --tenant rotisserie-dupont --email gerant@exemple.fr --name "Paul"
    zunqoo-crm seed-catalog rotisserie-dupont      # catalogue initial depuis le site
    zunqoo-crm preset rotisserie-dupont commerce   # formule de modules
"""

from __future__ import annotations

import argparse
import getpass

from sqlalchemy import select

from ..core.config import get_settings
from ..core.tenant_store import FileTenantStore
from .auth import hash_password
from .db import User, session_scope
from .modules import PRESETS, preset_selection
from .services import seed_catalog_from_profile, set_modules


def main() -> None:
    parser = argparse.ArgumentParser(description="Administration du CRM Zunqoo")
    sub = parser.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user", help="crée un accès au CRM pour un commerce")
    cu.add_argument("--tenant", required=True)
    cu.add_argument("--email", required=True)
    cu.add_argument("--name", default="")
    cu.add_argument("--role", choices=["admin", "membre"], default="admin")
    sc = sub.add_parser("seed-catalog", help="remplit le catalogue depuis la fiche du site")
    sc.add_argument("tenant")
    pr = sub.add_parser("preset", help="applique une formule de modules")
    pr.add_argument("tenant")
    pr.add_argument("preset", choices=list(PRESETS))
    args = parser.parse_args()

    settings = get_settings()
    tenant = FileTenantStore(settings.tenants_dir).get(args.tenant)
    if tenant is None:
        raise SystemExit(f"commerce inconnu : {args.tenant}")

    with session_scope(settings.database_url) as session:
        if args.cmd == "create-user":
            email = args.email.strip().lower()
            if session.scalar(select(User).where(User.email == email)):
                raise SystemExit(f"un compte existe déjà pour {email}")
            password = getpass.getpass("Mot de passe (10 caractères minimum) : ")
            if password != getpass.getpass("Confirmer : "):
                raise SystemExit("les mots de passe ne correspondent pas")
            session.add(User(tenant_id=tenant.id, email=email, name=args.name,
                             role=args.role, password_hash=hash_password(password)))
            print(f"Compte créé pour {email} ({tenant.profile.name}).")
        elif args.cmd == "seed-catalog":
            n = seed_catalog_from_profile(session, tenant.id, tenant.profile,
                                          vat_rate=tenant.default_vat_rate)
            print(f"{n} produits ajoutés." if n else "Catalogue déjà rempli : rien n'a changé.")
        else:
            states = set_modules(session, tenant.id, preset_selection(args.preset))
            on = [s.key.value for s in states.values() if s.enabled]
            print("Modules actifs : " + ", ".join(on))


if __name__ == "__main__":
    main()
