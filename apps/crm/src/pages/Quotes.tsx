import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type QuoteFull, type QuoteStatus, type QuoteSummary } from "../api";
import { formatEuro, formatWhen } from "../format";
import { useAuth } from "../auth";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";
import { SalesSwitch } from "./Invoices";

export const QUOTE_STATUS: Record<QuoteStatus, string> = {
  brouillon: "Brouillon",
  a_valider: "À valider",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
  facture: "Facturé",
};

const TABS: { key: string; label: string; match: (s: QuoteStatus) => boolean }[] = [
  { key: "en_cours", label: "En préparation", match: (s) => s === "brouillon" || s === "a_valider" },
  { key: "envoyes", label: "En attente de réponse", match: (s) => s === "envoye" },
  { key: "acceptes", label: "Acceptés", match: (s) => s === "accepte" || s === "facture" },
  { key: "tous", label: "Tous", match: () => true },
];

export function QuotesPage() {
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("vue")) ?? TABS[0];
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<QuoteSummary[]>("/api/quotes").then(setQuotes).catch((e) => setError(e.message));
  }, []);

  async function create() {
    try {
      const q = await api.post<QuoteFull>("/api/quotes", { title: "", lines: [] });
      navigate(`/devis/${q.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    }
  }

  const shown = quotes?.filter((q) => tab.match(q.status)) ?? null;
  return (
    <>
      {hasModule("factures") && <SalesSwitch current="devis" />}
      <PageHeader
        title="Devis"
        intro="Les devis préparés par l'assistant à partir des demandes reçues, et ceux que vous créez vous-même."
        actions={
          <button className="btn btn-primary" onClick={create}>
            <Icon name="plus" />
            Nouveau devis
          </button>
        }
      />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab.key}
                  onClick={() => setParams(t.key === "en_cours" ? {} : { vue: t.key })}>
            {t.label}
            {quotes && <span className="tab-count">{quotes.filter((q) => t.match(q.status)).length}</span>}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {!shown && !error && <Spinner />}
      {shown?.length === 0 && (
        <EmptyState icon="note" title="Aucun devis ici">
          Quand un client demande un devis par e-mail, l'assistant le prépare à partir de votre catalogue.
        </EmptyState>
      )}
      {shown && shown.length > 0 && (
        <ul className="card list">
          {shown.map((q) => (
            <li key={q.id}>
              <Link to={`/devis/${q.id}`} className="list-row">
                <span className="list-main">
                  <strong>{q.title || "Devis sans titre"}</strong>
                  <span>
                    {[q.number, q.contact?.name, q.sent_at ? `envoyé ${formatWhen(q.sent_at)}` : formatWhen(q.created_at)]
                      .filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="price">
                  <strong>{formatEuro(q.total_ttc)}</strong>
                  <span className={`pill pill-${q.status}`}>{QUOTE_STATUS[q.status]}</span>
                  {q.incomplete && <span className="pill pill-warn">prix à compléter</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
