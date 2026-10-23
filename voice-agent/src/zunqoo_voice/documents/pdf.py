"""PDF des devis, factures et avoirs (ReportLab, polices embarquées).

Les polices DejaVu sont livrées avec le code (licence libre, voir
``fonts/LICENSE-DejaVu.txt``) : accents et « € » s'affichent partout, et les
polices sont intégrées au PDF (prérequis du PDF/A-3 exigé par Factur-X).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .totals import Totals

_FONTS = Path(__file__).parent / "fonts"
_registered = False


def _register_fonts() -> None:
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont("DejaVu", str(_FONTS / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(_FONTS / "DejaVuSans-Bold.ttf")))
        _registered = True


ACCENT = colors.HexColor("#b8410f")
MUTED = colors.HexColor("#6b5c4c")
LINE = colors.HexColor("#e8dcc9")

TITLES = {"devis": "Devis", "facture": "Facture", "avoir": "Avoir"}


@dataclass
class Party:
    name: str
    lines: list[str] = field(default_factory=list)  # adresse, SIRET, contact…


@dataclass
class DocLine:
    description: str
    quantity: Decimal
    unit: str | None
    unit_price: Decimal
    vat_rate: Decimal
    total: Decimal
    detail: str | None = None


@dataclass
class DocumentView:
    kind: str                  # devis | facture | avoir
    number: str
    issue_date: date
    seller: Party
    client: Party
    lines: list[DocLine]
    totals: Totals
    prices_include_vat: bool
    title: str | None = None
    dates: list[tuple[str, str]] = field(default_factory=list)  # (libellé, valeur)
    notes: str | None = None
    mentions: list[str] = field(default_factory=list)
    signature_box: bool = False
    vat_franchise: bool = False


def fmt_money(value: Decimal) -> str:
    q = f"{value:,.2f}".replace(",", " ").replace(".", ",")
    return f"{q} €"


def fmt_qty(value: Decimal) -> str:
    text = f"{value.normalize():f}"
    return text.replace(".", ",")


def fmt_rate(value: Decimal) -> str:
    return f"{fmt_qty(value)} %"


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def render_pdf(doc: DocumentView) -> bytes:
    _register_fonts()
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm,
        bottomMargin=18 * mm, title=f"{TITLES[doc.kind]} {doc.number}",
        author=doc.seller.name, subject=doc.title or TITLES[doc.kind], lang="fr",
    )
    base = ParagraphStyle("base", fontName="DejaVu", fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=base, fontSize=7.5, leading=10, textColor=MUTED)
    bold = ParagraphStyle("bold", parent=base, fontName="DejaVu-Bold")
    big = ParagraphStyle("big", parent=base, fontName="DejaVu-Bold", fontSize=15, leading=19,
                         textColor=ACCENT, alignment=TA_RIGHT)
    right = ParagraphStyle("right", parent=base, alignment=TA_RIGHT)
    right_bold = ParagraphStyle("rightb", parent=bold, alignment=TA_RIGHT)

    story: list = []

    # En-tête : vendeur à gauche, titre et numéro à droite.
    seller = [_p(doc.seller.name, ParagraphStyle("s", parent=bold, fontSize=12, leading=15))]
    seller += [_p(line, small) for line in doc.seller.lines]
    title_block = [_p(f"{TITLES[doc.kind]} n° {doc.number}", big),
                   _p(f"Date : {doc.issue_date:%d/%m/%Y}", right)]
    title_block += [_p(f"{label} : {value}", right) for label, value in doc.dates]
    header = Table([[seller, title_block]], colWidths=[92 * mm, 86 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story += [header, Spacer(1, 10 * mm)]

    # Client, encadré à droite.
    client = [_p("Client", small), _p(doc.client.name, bold)]
    client += [_p(line, base) for line in doc.client.lines]
    client_box = Table([["", client]], colWidths=[100 * mm, 78 * mm])
    client_box.setStyle(TableStyle([("BOX", (1, 0), (1, 0), 0.6, LINE),
                                    ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fdf6ec")),
                                    ("LEFTPADDING", (1, 0), (1, 0), 8),
                                    ("TOPPADDING", (1, 0), (1, 0), 6),
                                    ("BOTTOMPADDING", (1, 0), (1, 0), 6)]))
    story += [client_box, Spacer(1, 8 * mm)]
    if doc.title:
        story += [_p(f"Objet : {doc.title}", bold), Spacer(1, 4 * mm)]

    # Lignes.
    mode = "TTC" if doc.prices_include_vat else "HT"
    head = ["Désignation", "Qté", f"Prix unit. {mode}", "TVA", f"Total {mode}"]
    rows: list[list] = [[_p(h, ParagraphStyle("h", parent=bold, textColor=colors.white))
                         for h in head]]
    for line in doc.lines:
        desc = line.description + (f"\n{line.detail}" if line.detail else "")
        qty = fmt_qty(line.quantity) + (f" {line.unit}" if line.unit else "")
        rows.append([_p(desc, base), _p(qty, right), _p(fmt_money(line.unit_price), right),
                     _p("—" if doc.vat_franchise else fmt_rate(line.vat_rate), right),
                     _p(fmt_money(line.total), right)])
    table = Table(rows, colWidths=[78 * mm, 22 * mm, 28 * mm, 18 * mm, 32 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [table, Spacer(1, 5 * mm)]

    # Totaux et ventilation de TVA.
    t = doc.totals
    sums: list[list] = []
    if not doc.vat_franchise:
        for g in t.vat_groups:
            sums.append([_p(f"Base HT {fmt_rate(g.rate)}", right), _p(fmt_money(g.base_ht), right)])
            sums.append([_p(f"TVA {fmt_rate(g.rate)}", right), _p(fmt_money(g.vat), right)])
    sums.append([_p("Total HT", right_bold), _p(fmt_money(t.total_ht), right_bold)])
    if not doc.vat_franchise:
        sums.append([_p("Total TVA", right_bold), _p(fmt_money(t.total_vat), right_bold)])
    label = "Net à payer" if doc.kind == "facture" else "Total TTC"
    if doc.kind == "avoir":
        label = "Montant de l'avoir TTC"
    sums.append([_p(label, ParagraphStyle("tt", parent=right_bold, fontSize=11, textColor=ACCENT)),
                 _p(fmt_money(t.total_ttc), ParagraphStyle("tv", parent=right_bold, fontSize=11,
                                                           textColor=ACCENT))])
    totals_table = Table(sums, colWidths=[146 * mm, 32 * mm])
    totals_table.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 0.8, ACCENT),
                                      ("TOPPADDING", (0, 0), (-1, -1), 2),
                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story += [totals_table, Spacer(1, 6 * mm)]

    if doc.notes:
        story += [_p(doc.notes, base), Spacer(1, 4 * mm)]
    for mention in doc.mentions:
        story.append(_p(mention, small))
    if doc.signature_box:
        box = Table([[_p("Bon pour accord — date et signature du client :", base)], [""]],
                    colWidths=[80 * mm], rowHeights=[None, 22 * mm])
        box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE)]))
        story += [Spacer(1, 6 * mm), box]

    pdf.build(story)
    return buf.getvalue()
