// Éditeur de lignes partagé par les devis et les factures.
import { api, type CatalogItem, type QuoteLine } from "../api";
import { formatEuro, parseEuroInput } from "../format";
import { Icon } from "../ui";

export const VAT_RATES = ["5.5", "10", "20", "2.1", "0"];

export interface EditLine {
  description: string;
  detail: string;
  catalog_item_id: string | null;
  quantity: string;
  unit: string;
  price: string; // saisie française « 12,50 »
  vat_rate: string;
}

export const toEdit = (l: QuoteLine): EditLine => ({
  description: l.description,
  detail: l.detail ?? "",
  catalog_item_id: l.catalog_item_id,
  quantity: l.quantity.replace(".", ","),
  unit: l.unit ?? "",
  price: l.unit_price == null ? "" : l.unit_price.replace(".", ","),
  vat_rate: l.vat_rate,
});

export const num = (text: string) => Number(text.replace(",", ".").replace(/\s/g, ""));

export function validateLines(lines: EditLine[]): string | null {
  for (const l of lines) {
    if (!l.description.trim()) return "Chaque ligne doit avoir une désignation.";
    if (!(num(l.quantity) > 0)) return `Quantité invalide pour « ${l.description} ».`;
    if (l.price && Number.isNaN(parseEuroInput(l.price))) return `Prix invalide pour « ${l.description} ».`;
  }
  return null;
}

export function linesPayload(lines: EditLine[]) {
  return lines.map((l) => ({
    description: l.description, detail: l.detail || null, catalog_item_id: l.catalog_item_id,
    quantity: l.quantity.replace(",", "."), unit: l.unit || null,
    unit_price: l.price ? String(parseEuroInput(l.price)) : null, vat_rate: l.vat_rate,
  }));
}

export function previewTotal(lines: EditLine[]): number {
  return lines.reduce((sum, l) => {
    const total = num(l.quantity) * num(l.price);
    return Number.isFinite(total) && l.price ? sum + total : sum;
  }, 0);
}

export function LinesEditor({
  lines, onChange, editable, catalog, pricesIncludeVat, defaultVat, label,
}: {
  lines: EditLine[];
  onChange: (lines: EditLine[]) => void;
  editable: boolean;
  catalog: CatalogItem[];
  pricesIncludeVat: boolean;
  defaultVat: number;
  label: string;
}) {
  const change = (i: number, patch: Partial<EditLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function addFromCatalog(itemId: string) {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const price = pricesIncludeVat ? item.price_ttc : item.price_ht;
    onChange([...lines, {
      description: item.name, detail: "", catalog_item_id: item.id, quantity: "1",
      unit: item.unit ?? "", price: price == null ? "" : String(price).replace(".", ","),
      vat_rate: String(item.vat_rate),
    }]);
  }

  return (
    <>
      <div className="quote-lines" role="table" aria-label={label}>
        <div className="quote-line head" role="row">
          <span role="columnheader">Désignation</span><span role="columnheader">Qté</span>
          <span role="columnheader">Prix unit.</span><span role="columnheader">TVA</span>
          <span role="columnheader">Total</span><span />
        </div>
        {lines.map((l, i) => {
          const total = num(l.quantity) * num(l.price);
          return (
            <div className={`quote-line ${l.price ? "" : "missing-price"}`} role="row" key={i}>
              <span className="ql-desc">
                <input aria-label="Désignation" value={l.description} disabled={!editable}
                       onChange={(e) => change(i, { description: e.target.value })} />
                <input aria-label="Précision" className="ql-detail" placeholder="Précision (facultatif)"
                       value={l.detail} disabled={!editable} onChange={(e) => change(i, { detail: e.target.value })} />
              </span>
              <span className="ql-qty">
                <input aria-label="Quantité" inputMode="decimal" value={l.quantity} disabled={!editable}
                       onChange={(e) => change(i, { quantity: e.target.value })} />
                <input aria-label="Unité" placeholder="unité" value={l.unit} disabled={!editable}
                       onChange={(e) => change(i, { unit: e.target.value })} />
              </span>
              <input aria-label="Prix unitaire" inputMode="decimal" value={l.price} disabled={!editable}
                     placeholder="à compléter" onChange={(e) => change(i, { price: e.target.value })} />
              <select aria-label="TVA" value={l.vat_rate} disabled={!editable}
                      onChange={(e) => change(i, { vat_rate: e.target.value })}>
                {[...new Set([...VAT_RATES, l.vat_rate])].map((r) => (
                  <option key={r} value={r}>{r.replace(".", ",")} %</option>
                ))}
              </select>
              <span className="ql-total">{l.price && Number.isFinite(total) ? formatEuro(total) : "—"}</span>
              {editable ? (
                <button className="btn btn-small btn-icon" aria-label={`Retirer ${l.description}`}
                        onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={16} />
                </button>
              ) : <span />}
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="presets">
          <label className="visually-hidden" htmlFor="add-catalog">Ajouter un produit du catalogue</label>
          <select id="add-catalog" value="" onChange={(e) => addFromCatalog(e.target.value)}>
            <option value="">+ Ajouter un produit du catalogue…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {formatEuro(pricesIncludeVat ? c.price_ttc : c.price_ht)}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={() => onChange([...lines, {
            description: "", detail: "", catalog_item_id: null, quantity: "1", unit: "", price: "",
            vat_rate: String(defaultVat),
          }])}>
            <Icon name="plus" />Ligne libre
          </button>
        </div>
      )}
    </>
  );
}

export function loadActiveCatalog(setCatalog: (c: CatalogItem[]) => void) {
  return () => api.get<CatalogItem[]>("/api/catalog").then((c) => setCatalog(c.filter((i) => i.active))).catch(() => {});
}
