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

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Champ de texte modifiable selon le type de validation.
  const EDIT_KEY: Record<string, string> = {
    email_reponse: "body", devis_envoi: "email_body", devis_relance: "body",
    facture_emission: "email_body", facture_relance: "body",
  };

  async function decide(a: Approval, approve: boolean) {
    setBusy(a.id);
    setError(null);
    const edited = drafts[a.id];
    if (approve && edited !== undefined && !edited.trim()) {
      setBusy(null);
      return setError("La réponse est vide.");
    }
    try {
      const done = await api.post<Approval>(`/api/approvals/${a.id}/decision`, {
        approve,
        ...(approve && edited !== undefined ? { edits: { [EDIT_KEY[a.kind] ?? "body"]: edited } } : {}),
      });
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
            {(a.kind === "devis_envoi" || a.kind === "devis_relance") && typeof a.payload.quote_id === "string" && (
              <div className="presets">
                <Link className="btn btn-small btn-ghost" to={`/devis/${a.payload.quote_id}`}>Ouvrir le devis</Link>
                <button className="btn btn-small btn-ghost"
                        onClick={() => api.openPdf(`/api/quotes/${a.payload.quote_id}/pdf`).catch((e) => setError(e.message))}>
                  Voir le PDF
                </button>
              </div>
            )}
            {(a.kind === "facture_emission" || a.kind === "facture_relance") && typeof a.payload.invoice_id === "string" && (
              <div className="presets">
                <Link className="btn btn-small btn-ghost" to={`/factures/${a.payload.invoice_id}`}>Ouvrir la facture</Link>
                <button className="btn btn-small btn-ghost"
                        onClick={() => api.openPdf(`/api/invoices/${a.payload.invoice_id}/pdf`).catch((e) => setError(e.message))}>
                  Voir le PDF
                </button>
              </div>
            )}
            {EDIT_KEY[a.kind] && (
              <>
                {typeof a.payload.incoming === "string" && (
                  <details>
                    <summary>Voir l'e-mail reçu</summary>
                    <pre className="transcript">{a.payload.incoming}</pre>
                  </details>
                )}
                {a.status === "en_attente" ? (
                  <label className="field reply-editor">
                    <span>{a.kind === "email_reponse" ? "Réponse proposée" : "Message d'accompagnement"} (vous pouvez le modifier{a.kind === "facture_emission" ? " ; vide = message standard" : ""})</span>
                    <textarea rows={8} value={drafts[a.id] ?? String(a.payload[EDIT_KEY[a.kind]] ?? "")}
                              onChange={(e) => setDrafts({ ...drafts, [a.id]: e.target.value })} />
                  </label>
                ) : (
                  <details>
                    <summary>Voir la réponse</summary>
                    <pre className="transcript">{String(a.payload[EDIT_KEY[a.kind]] ?? "")}</pre>
                  </details>
                )}
              </>
            )}
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
