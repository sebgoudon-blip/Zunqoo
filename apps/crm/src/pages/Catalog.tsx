import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, type CatalogItem } from "../api";
import { useAuth } from "../auth";
import { formatEuro, parseEuroInput } from "../format";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

const VAT_RATES = [5.5, 10, 20, 2.1, 0];
const SOURCE_LABEL = { site: "Repris du site", manuel: "Ajouté à la main", import: "Importé" };

interface Draft {
  name: string;
  category: string;
  price: string;
  price_includes_vat: boolean;
  vat_rate: number;
  unit: string;
  description: string;
  availability: string;
}

function toDraft(item: CatalogItem | null, vat: number, ttc: boolean): Draft {
  return {
    name: item?.name ?? "",
    category: item?.category ?? "",
    price: item?.price != null ? String(item.price).replace(".", ",") : "",
    price_includes_vat: item?.price_includes_vat ?? ttc,
    vat_rate: item?.vat_rate ?? vat,
    unit: item?.unit ?? "",
    description: item?.description ?? "",
    availability: item?.availability ?? "",
  };
}

export function CatalogPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => api.get<CatalogItem[]>("/api/catalog").then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of items ?? []) {
      const key = item.category || "Sans catégorie";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  async function onImport(file: File) {
    setError(null);
    setNotice(null);
    const data = new FormData();
    data.append("file", file);
    try {
      const r = await api.post<{ created: number; updated: number; errors: string[] }>("/api/catalog/import", data);
      setNotice(`${r.created} produit(s) ajouté(s), ${r.updated} mis à jour.` +
                (r.errors.length ? ` ${r.errors.length} ligne(s) ignorée(s) : ${r.errors.join(" ; ")}` : ""));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function toggleActive(item: CatalogItem) {
    try {
      const updated = await api.patch<CatalogItem>(`/api/catalog/${item.id}`, { active: !item.active });
      setItems((list) => list?.map((x) => (x.id === item.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    }
  }

  async function remove(item: CatalogItem) {
    if (!window.confirm(`Supprimer « ${item.name} » du catalogue ?`)) return;
    try {
      await api.del(`/api/catalog/${item.id}`);
      setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  return (
    <>
      <PageHeader
        title="Catalogue"
        intro="Vos produits et tarifs. L'assistant s'en sert pour répondre au téléphone, et plus tard pour vos devis et factures."
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <Icon name="plus" />
              Ajouter un produit
            </button>
            <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" />
              Importer un fichier
            </button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden
                   onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </>
        }
      />
      <p className="hint">
        Import depuis Excel : « Enregistrer sous » → CSV. Colonnes reconnues : nom, catégorie, prix
        (ou prix HT), TVA, unité, description.{" "}
        <button className="link" onClick={() => api.download("/api/catalog/modele.csv", "modele-catalogue.csv")}>
          Télécharger le modèle
        </button>
      </p>
      <ErrorBanner message={error} />
      {notice && <div className="banner banner-ok" role="status">{notice}</div>}
      {editing && me && (
        <ItemForm
          item={editing === "new" ? null : editing}
          defaults={{ vat: me.business.default_vat_rate, ttc: me.business.prices_include_vat }}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((list) => {
              const others = (list ?? []).filter((x) => x.id !== saved.id);
              return [...others, saved];
            });
            setEditing(null);
          }}
        />
      )}
      {!items && !error && <Spinner />}
      {items?.length === 0 && !editing && (
        <EmptyState icon="box" title="Votre catalogue est vide">
          Ajoutez vos produits un par un, ou importez votre liste de prix en une fois.
        </EmptyState>
      )}
      {groups.map(([category, list]) => (
        <section key={category} className="card">
          <h2>{category}</h2>
          <ul className="list">
            {[...list].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((item) => (
              <li key={item.id} className={`list-row catalog-row ${item.active ? "" : "inactive"}`}>
                <span className="list-main">
                  <strong>{item.name}</strong>
                  <span>
                    {[item.unit && `par ${item.unit}`, item.availability, SOURCE_LABEL[item.source]]
                      .filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="price">
                  <strong>{formatEuro(item.price_ttc)}</strong>
                  <span className="muted">{item.price_ht != null && `${formatEuro(item.price_ht)} HT · TVA ${String(item.vat_rate).replace(".", ",")} %`}</span>
                </span>
                <span className="row-actions">
                  <button className="btn btn-small btn-ghost" onClick={() => setEditing(item)}>Modifier</button>
                  <button className="btn btn-small btn-ghost" onClick={() => toggleActive(item)}
                          aria-pressed={!item.active}>
                    {item.active ? "Masquer" : "Réactiver"}
                  </button>
                  <button className="btn btn-small btn-icon" onClick={() => remove(item)}
                          aria-label={`Supprimer ${item.name}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ItemForm({
  item, defaults, onClose, onSaved,
}: {
  item: CatalogItem | null;
  defaults: { vat: number; ttc: boolean };
  onClose: () => void;
  onSaved: (i: CatalogItem) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(item, defaults.vat, defaults.ttc));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const price = parseEuroInput(d.price);
    if (Number.isNaN(price)) return setError("Prix invalide : écrivez par exemple 12,50.");
    const body = {
      name: d.name.trim(), category: d.category.trim() || null, price,
      price_includes_vat: d.price_includes_vat, vat_rate: d.vat_rate, unit: d.unit.trim() || null,
      description: d.description.trim() || null, availability: d.availability.trim() || null,
    };
    setBusy(true);
    try {
      onSaved(item ? await api.patch<CatalogItem>(`/api/catalog/${item.id}`, body)
                   : await api.post<CatalogItem>("/api/catalog", body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <h2>{item ? `Modifier « ${item.name} »` : "Nouveau produit"}</h2>
      <ErrorBanner message={error} />
      <label className="field span-2">
        <span>Nom du produit *</span>
        <input required value={d.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="field">
        <span>Catégorie</span>
        <input value={d.category} placeholder="Ex. : Volailles" onChange={(e) => set("category", e.target.value)} />
      </label>
      <label className="field">
        <span>Unité</span>
        <input value={d.unit} placeholder="pièce, kg, portion…" onChange={(e) => set("unit", e.target.value)} />
      </label>
      <label className="field">
        <span>Prix (€)</span>
        <input inputMode="decimal" value={d.price} placeholder="Laisser vide si sur demande"
               onChange={(e) => set("price", e.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Ce prix est</legend>
        <div className="segmented">
          <label><input type="radio" checked={d.price_includes_vat} onChange={() => set("price_includes_vat", true)} /> TTC</label>
          <label><input type="radio" checked={!d.price_includes_vat} onChange={() => set("price_includes_vat", false)} /> HT</label>
        </div>
      </fieldset>
      <label className="field">
        <span>TVA</span>
        <select value={d.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))}>
          {[...new Set([...VAT_RATES, d.vat_rate])].map((r) => (
            <option key={r} value={r}>{String(r).replace(".", ",")} %</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Disponibilité</span>
        <input value={d.availability} placeholder="Ex. : week-end uniquement"
               onChange={(e) => set("availability", e.target.value)} />
      </label>
      <label className="field span-2">
        <span>Description</span>
        <textarea rows={2} value={d.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
