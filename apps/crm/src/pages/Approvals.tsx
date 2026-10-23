import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Approval } from "../api";
import { formatWhen } from "../format";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

const STATUS_LABEL: Record<Approval["status"], string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  approuve: "Validé",
  refuse: "Refusé",
  execute: "Envoyé",
  echec: "Échec de l'envoi",
};

export function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("vue") === "historique" ? "historique" : "en_attente";
  const highlight = params.get("id");
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .get<Approval[]>(`/api/approvals?status=${tab === "historique" ? "tous" : "en_attente"}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [tab]);
  useEffect(load, [load]);

  async function decide(a: Approval, approve: boolean) {
    setBusy(a.id);
    setError(null);
    try {
      const done = await api.post<Approval>(`/api/approvals/${a.id}/decision`, { approve });
      setItems((list) => (tab === "en_attente" ? list?.filter((x) => x.id !== a.id) ?? null
                                               : list?.map((x) => (x.id === a.id ? done : x)) ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
      load(); // peut-être déjà traité depuis WhatsApp
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="À valider"
                  intro="Ce que l'assistant a préparé et qui attend votre accord. Vous pouvez aussi valider depuis WhatsApp." />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "en_attente"} onClick={() => setParams({})}>
          En attente
        </button>
        <button role="tab" aria-selected={tab === "historique"}
                onClick={() => setParams({ vue: "historique" })}>
          Historique
        </button>
      </div>
      <ErrorBanner message={error} />
      {!items && !error && <Spinner />}
      {items?.length === 0 && (
        <EmptyState icon="checkCircle" title={tab === "en_attente" ? "Tout est à jour" : "Aucun historique"}>
          {tab === "en_attente"
            ? "Quand l'assistant préparera un devis, une facture ou une réponse importante, elle apparaîtra ici."
            : "Les décisions prises apparaîtront ici."}
        </EmptyState>
      )}
      <ul className="approval-list">
        {items?.map((a) => (
          <li key={a.id} className={`card approval ${a.id === highlight ? "highlight" : ""}`}>
            <div className="approval-head">
              <h2>{a.title}</h2>
              <time dateTime={a.created_at}>{formatWhen(a.created_at)}</time>
            </div>
            {a.contact && <Link to={`/clients/${a.contact.id}`}>{a.contact.name}</Link>}
            <p className="approval-summary">{a.summary}</p>
            {a.status === "en_attente" ? (
              <div className="approval-actions">
                <button className="btn btn-primary" disabled={busy === a.id} onClick={() => decide(a, true)}>
                  <Icon name="check" />
                  Valider et envoyer
                </button>
                <button className="btn btn-ghost" disabled={busy === a.id} onClick={() => decide(a, false)}>
                  <Icon name="x" />
                  Refuser
                </button>
              </div>
            ) : (
              <p className={`status status-${a.status}`}>
                {STATUS_LABEL[a.status]}
                {a.decided_by && ` par ${a.decided_by.replace("whatsapp:", "WhatsApp ")}`}
                {a.result && a.status === "echec" && ` — ${a.result}`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
