import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type InvoiceFull, type InvoiceStatus, type InvoiceSummary } from "../api";
import { formatEuro, formatWhen } from "../format";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  brouillon: "Brouillon",
  emise: "À encaisser",
  partiellement_payee: "Payée en partie",
  payee: "Payée",
  annulee: "Annulée par avoir",
};

export function statusLabel(i: InvoiceSummary): string {
  if (i.kind === "avoir") return i.status === "brouillon" ? "Avoir (brouillon)" : "Avoir";
  return i.overdue ? "En retard" : INVOICE_STATUS[i.status];
}

const TABS: { key: string; label: string; match: (i: InvoiceSummary) => boolean }[] = [
  { key: "a_encaisser", label: "À encaisser", match: (i) => i.kind === "facture" && (i.status === "emise" || i.status === "partiellement_payee") },
  { key: "retard", label: "En retard", match: (i) => i.overdue },
  { key: "brouillons", label: "Brouillons", match: (i) => i.status === "brouillon" },
  { key: "payees", label: "Payées", match: (i) => i.status === "payee" },
  { key: "tous", label: "Toutes", match: () => true },
];

export function SalesSwitch({ current }: { current: "devis" | "factures" }) {
  return (
    <nav className="sales-switch" aria-label="Ventes">
      <Link to="/devis" aria-current={current === "devis" ? "page" : undefined}>Devis</Link>
      <Link to="/factures" aria-current={current === "factures" ? "page" : undefined}>Factures</Link>
    </nav>
  );
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("vue")) ?? TABS[0];
  const [items, setItems] = useState<InvoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<InvoiceSummary[]>("/api/invoices").then(setItems).catch((e) => setError(e.message));
  }, []);

  async function create() {
    try {
      const inv = await api.post<InvoiceFull>("/api/invoices", { title: "", lines: [] });
      navigate(`/factures/${inv.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    }
  }

  const shown = items?.filter(tab.match) ?? null;
  const toCollect = items?.filter(TABS[0].match).reduce((s, i) => s + i.remaining, 0) ?? 0;
  return (
    <>
      <SalesSwitch current="factures" />
      <PageHeader
        title="Factures"
        intro={items ? `${formatEuro(toCollect)} restent à encaisser.` : undefined}
        actions={<button className="btn btn-primary" onClick={create}><Icon name="plus" />Nouvelle facture</button>}
      />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab.key}
                  onClick={() => setParams(t.key === "a_encaisser" ? {} : { vue: t.key })}>
            {t.label}
            {items && <span className="tab-count">{items.filter(t.match).length}</span>}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {!shown && !error && <Spinner />}
      {shown?.length === 0 && (
        <EmptyState icon="note" title="Rien ici">
          Les factures se créent depuis un devis accepté, ou avec « Nouvelle facture ».
        </EmptyState>
      )}
      {shown && shown.length > 0 && (
        <ul className="card list">
          {shown.map((i) => (
            <li key={i.id}>
              <Link to={`/factures/${i.id}`} className="list-row">
                <span className="list-main">
                  <strong>{i.number ?? "Brouillon"}{i.title ? ` — ${i.title}` : ""}</strong>
                  <span>
                    {[i.contact?.name,
                      i.due_date && i.kind === "facture" && i.status !== "payee" ? `échéance ${formatWhen(i.due_date).replace(/ \d\d:\d\d$/, "")}` : null,
                      !i.issue_date ? formatWhen(i.created_at) : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="price">
                  <strong>{i.kind === "avoir" ? "−" : ""}{formatEuro(i.total_ttc)}</strong>
                  <span className={`pill pill-inv-${i.overdue ? "retard" : i.status}`}>{statusLabel(i)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
