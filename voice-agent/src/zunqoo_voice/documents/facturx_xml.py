"""Factur-X (norme européenne EN 16931) : données structurées de la facture.

Le XML (syntaxe CII) est généré par la bibliothèque ``factur-x`` à partir
d'un dictionnaire de « termes métier » (BT-xx), puis vérifié contre le
schéma XSD officiel et intégré au PDF. C'est le format accepté par les
plateformes agréées de la réforme de la facturation électronique.

En mode TTC, les montants HT des lignes sont déduits puis ajustés au
centime sur la dernière ligne de chaque taux, pour que les sommes de lignes
égalent exactement les bases de TVA (règles BR-CO de la norme).
"""

from __future__ import annotations

import importlib
from datetime import date
from decimal import Decimal

import facturx

from .totals import CENT, Totals, money

_UNIT_CODES = {  # recommandation UN/ECE n° 20
    "kg": "KGM", "kilo": "KGM", "kilogramme": "KGM", "g": "GRM",
    "l": "LTR", "litre": "LTR", "litres": "LTR",
    "pièce": "H87", "piece": "H87", "pièces": "H87", "unité": "H87",
    "heure": "HUR", "h": "HUR", "jour": "DAY",
}
INVOICE, CREDIT_NOTE = "380", "381"


def unit_code(unit: str | None) -> str:
    return _UNIT_CODES.get((unit or "").strip().lower(), "C62")  # C62 = « une unité »


def _party(p: dict) -> dict:
    out = {
        "name": p.get("name") or "",
        "country_code": "FR",
        "addr_l1": p.get("address") or None,
        "postcode": p.get("postal_code") or None,
        "city": p.get("city") or None,
    }
    if p.get("siren"):
        out |= {"legal_identifier": p["siren"][:9], "legal_identifier_schemeid": "0002"}
    if p.get("vat_number"):
        out["vat_identifier"] = p["vat_number"]
    if p.get("email"):
        out["contacts"] = [{"email": p["email"]}]
    return {k: v for k, v in out.items() if v not in (None, "")}


def net_line_amounts(lines: list[dict], totals: Totals, prices_include_vat: bool) -> dict[int, Decimal]:
    """Montant net HT de chaque ligne, cohérent au centime avec les bases de TVA."""
    if not prices_include_vat:
        return {lt.index: lt.total for lt in totals.lines}
    out: dict[int, Decimal] = {}
    for group in totals.vat_groups:
        members = [lt for lt in totals.lines if lt.vat_rate == group.rate]
        running = Decimal(0)
        for n, lt in enumerate(members):
            if n == len(members) - 1:
                out[lt.index] = group.base_ht - running
            else:
                ht = money(lt.total / (1 + lt.vat_rate / 100))
                out[lt.index] = ht
                running += ht
    return out


def build_data_dict(*, kind: str, number: str, issue_date: date, due_date: date | None,
                    delivery_date: date | None, seller: dict, buyer: dict, lines: list[dict],
                    totals: Totals, prices_include_vat: bool, vat_franchise: bool,
                    payment_terms: str, iban: str | None, notes: list[str],
                    preceding_number: str | None = None, amount_paid: Decimal = Decimal(0)) -> dict:
    nets = net_line_amounts(lines, totals, prices_include_vat)
    by_index = {lt.index: lt for lt in totals.lines}
    category = "E" if vat_franchise else "S"
    data: dict = {
        "BT-1": number,
        "BT-2": issue_date,
        "BT-3": CREDIT_NOTE if kind == "avoir" else INVOICE,
        "BT-5": "EUR",
        "BG-1": [{"BT-22": n} for n in notes if n],
        "BG-4": _party(seller),
        "BG-7": _party(buyer),
        "BT-20": payment_terms,
        "BT-106": sum(nets.values(), Decimal(0)),
        "BT-109": totals.total_ht,
        "BT-110": totals.total_vat,
        "BT-112": totals.total_ttc,
        "BT-113": amount_paid,
        "BT-115": (totals.total_ttc - amount_paid).quantize(CENT),
        "BG-23": [
            {"BT-116": g.base_ht, "BT-117": g.vat, "BT-118": category, "BT-119": g.rate,
             **({"BT-120": "TVA non applicable, art. 293 B du CGI",
                 "BT-121": "VATEX-FR-FRANCHISE"} if vat_franchise else {})}
            for g in totals.vat_groups
        ],
        "BG-25": [],
    }
    if due_date:
        data["BT-9"] = due_date
    if delivery_date:
        data["BT-72"] = delivery_date
    if iban:
        data |= {"BT-81": "58", "BT-84": iban}  # 58 = virement SEPA
    if preceding_number:
        data["BG-1"].append({"BT-22": f"Avoir sur la facture {preceding_number}"})
    for n, (i, line) in enumerate(sorted((i, ln) for i, ln in enumerate(lines) if i in by_index),
                                  start=1):
        lt = by_index[i]
        net = nets[i]
        unit_price = (net / lt.quantity).quantize(Decimal("0.0001")) if lt.quantity else net
        data["BG-25"].append({
            "BT-126": str(n),
            "BT-129": lt.quantity,
            "BT-130": unit_code(line.get("unit")),
            "BT-131": net,
            "BT-146": unit_price,
            "BT-151": category,
            "BT-152": lt.vat_rate,
            "BT-153": line["description"][:200],
            **({"BT-154": line["detail"]} if line.get("detail") else {}),
        })
    return data


def _as_text(value):
    """La bibliothèque attend les montants en texte : aucune perte via float."""
    if isinstance(value, Decimal):
        return f"{value:f}"
    if isinstance(value, dict):
        return {k: _as_text(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_as_text(v) for v in value]
    return value


def generate_xml(data: dict) -> bytes:
    """XML CII niveau EN 16931, vérifié contre le XSD officiel."""
    gen = importlib.import_module("facturx.generate_xml")
    xml = gen.generate_cii_xml(_as_text(data), level="en16931", check_xsd=True,
                               check_schematron=False)
    return xml if isinstance(xml, bytes) else xml.encode()


def embed(pdf: bytes, xml: bytes, *, title: str, author: str) -> bytes:
    return facturx.generate_from_binary(
        pdf, xml, flavor="factur-x", level="en16931", check_xsd=False, lang="fr-FR",
        pdf_metadata={"author": author, "title": title, "subject": title,
                      "keywords": "Factur-X, facture"},
    )
