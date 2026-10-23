"""Calcul des montants d'un devis ou d'une facture, au centime près.

Deux modes, comme sur le terrain :
- **TTC** (commerce de détail) : les prix saisis sont ceux affichés au client.
  Le total TTC est la somme exacte des lignes ; le HT et la TVA sont déduits
  par taux.
- **HT** (clients professionnels) : la TVA est calculée par taux sur le HT.

Les montants sont en ``Decimal`` et arrondis au centime « au plus proche,
moitié vers le haut », comme le pratiquent les logiciels de facturation.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class LineTotal:
    index: int
    quantity: Decimal
    unit_price: Decimal      # tel que saisi (HT ou TTC selon le document)
    vat_rate: Decimal
    total: Decimal           # quantité × prix, dans le mode du document


@dataclass
class VatGroup:
    rate: Decimal
    base_ht: Decimal
    vat: Decimal
    total_ttc: Decimal


@dataclass
class Totals:
    lines: list[LineTotal]
    vat_groups: list[VatGroup]
    total_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    complete: bool           # toutes les lignes ont un prix


def compute_totals(lines: list[dict], *, prices_include_vat: bool,
                   vat_franchise: bool = False) -> Totals:
    computed: list[LineTotal] = []
    by_rate: dict[Decimal, Decimal] = {}
    complete = True
    for i, line in enumerate(lines):
        qty = Decimal(str(line.get("quantity") or 0))
        if line.get("unit_price") is None:
            complete = False
            continue
        price = Decimal(str(line["unit_price"]))
        rate = Decimal(0) if vat_franchise else Decimal(str(line.get("vat_rate") or 0))
        total = money(qty * price)
        computed.append(LineTotal(i, qty, price, rate, total))
        by_rate[rate] = by_rate.get(rate, Decimal(0)) + total

    groups: list[VatGroup] = []
    for rate, amount in sorted(by_rate.items()):
        if prices_include_vat:
            ttc = money(amount)
            ht = money(ttc / (1 + rate / 100))
            vat = ttc - ht
        else:
            ht = money(amount)
            vat = money(ht * rate / 100)
            ttc = ht + vat
        groups.append(VatGroup(rate, ht, vat, ttc))

    return Totals(
        lines=computed,
        vat_groups=groups,
        total_ht=sum((g.base_ht for g in groups), Decimal("0.00")),
        total_vat=sum((g.vat for g in groups), Decimal("0.00")),
        total_ttc=sum((g.total_ttc for g in groups), Decimal("0.00")),
        complete=complete,
    )
