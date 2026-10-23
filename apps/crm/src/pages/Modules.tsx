import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Autonomy, type EmailStatus, type ModuleInfo, type ModulesResponse,
         type SyncResult } from "../api";
import { formatWhen } from "../format";
import { Link } from "react-router-dom";
import { BusinessForm } from "./BusinessForm";
import { useAuth } from "../auth";
import { ErrorBanner, PageHeader, Spinner } from "../ui";

const AUTONOMY: { value: Autonomy; label: string; help: string }[] = [
  { value: "valider_tout", label: "Je valide tout", help: "Rien ne part sans votre accord." },
  { value: "valider_important", label: "Je valide l'important",
    help: "Les réponses simples partent seules, ce qui engage un prix ou un délai attend votre accord." },
  { value: "automatique", label: "Automatique", help: "L'assistant agit seul, vous êtes informé." },
];

export function ModulesPage() {
  const { me, refresh } = useAuth();
  const [data, setData] = useState<ModulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = me?.user.role === "admin";

  useEffect(() => {
    api.get<ModulesResponse>("/api/modules").then(setData).catch((e) => setError(e.message));
  }, []);

  const labelOf = (key: string) => data?.modules.find((m) => m.key === key)?.label ?? key;

  async function apply(call: () => Promise<ModulesResponse>) {
    setBusy(true);
    setError(null);
    try {
      setData(await call());
      await refresh(); // met à jour la navigation et l'accueil
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(m: ModuleInfo) {
    if (m.enabled && data) {
      const dependents = data.modules.filter((x) => x.enabled && x.requires.includes(m.key));
      if (dependents.length && !window.confirm(
        `Désactiver « ${m.label} » désactivera aussi : ${dependents.map((x) => x.label).join(", ")}. Continuer ?`,
      )) return;
    }
    apply(() => api.patch<ModulesResponse>(`/api/modules/${m.key}`, { enabled: !m.enabled }));
  }

  return (
    <>
      <PageHeader title="Réglages"
                  intro="Choisissez ce que l'assistant fait pour vous. Commencez simple : vous pourrez activer le reste quand vous voulez." />
      <ErrorBanner message={error} />
      {!isAdmin && (
        <div className="banner" role="note">Seul l'administrateur du compte peut modifier ces réglages.</div>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <section className="card">
            <h2>Formules de départ</h2>
            <p className="muted">Un clic pour partir sur une base, vous ajustez ensuite module par module.</p>
            <div className="presets">
              {data.presets.map((p) => (
                <button key={p.key} className="btn btn-ghost" disabled={!isAdmin || busy}
                        onClick={() => apply(() => api.post<ModulesResponse>("/api/modules/preset", { preset: p.key }))}>
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <Link to="/catalogue" className="card catalog-shortcut">
            <strong>Catalogue</strong>
            <span className="muted">Vos produits et tarifs, utilisés au téléphone et dans les devis.</span>
          </Link>
          <ul className="module-list">
            {data.modules.map((m) => (
              <li key={m.key} className={`card module ${m.enabled ? "on" : ""} ${m.available ? "" : "soon"}`}>
                <div className="module-head">
                  <div>
                    <h2 id={`mod-${m.key}`}>{m.label}</h2>
                    <p className="muted">{m.description}</p>
                    {m.requires.length > 0 && (
                      <p className="requires">Nécessite : {m.requires.map(labelOf).join(", ")}</p>
                    )}
                  </div>
                  {m.available ? (
                    <button role="switch" aria-checked={m.enabled} aria-labelledby={`mod-${m.key}`}
                            className="switch" disabled={!isAdmin || busy} onClick={() => toggle(m)}>
                      <span className="switch-thumb" />
                      <span className="switch-text">{m.enabled ? "Activé" : "Désactivé"}</span>
                    </button>
                  ) : (
                    <span className="soon-tag">Bientôt disponible</span>
                  )}
                </div>
                {m.enabled && m.key === "emails" && <EmailConnection isAdmin={isAdmin} />}
                {m.enabled && m.has_autonomy && (
                  <fieldset className="autonomy">
                    <legend>Niveau d'autonomie</legend>
                    {AUTONOMY.map((a) => (
                      <label key={a.value} className={`autonomy-option ${m.autonomy === a.value ? "selected" : ""}`}>
                        <input type="radio" name={`autonomy-${m.key}`} checked={m.autonomy === a.value}
                               disabled={!isAdmin || busy}
                               onChange={() => apply(() => api.patch<ModulesResponse>(`/api/modules/${m.key}`, { autonomy: a.value }))} />
                        <span><strong>{a.label}</strong>{a.help}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
          <BusinessForm isAdmin={isAdmin} />
        </>
      )}
    </>
  );
}

function EmailConnection({ isAdmin }: { isAdmin: boolean }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<EmailStatus>("/api/email/status").then(setStatus).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const result = params.get("gmail");
    if (result === "ok") setNotice("Boîte Gmail connectée. L'assistant relève les e-mails toutes les 2 minutes.");
    else if (result) setError(params.get("message") ?? "Connexion Gmail impossible.");
    if (result) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>("/api/email/connect");
      window.location.assign(url); // page Google, puis retour ici
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<SyncResult>("/api/email/sync");
      setNotice(r.seen === 0 ? "Aucun nouvel e-mail."
        : `${r.seen} e-mail(s) relevé(s) : ${r.auto_sent} répondu(s) seul(s), ${r.to_validate} à valider, ${r.ignored} ignoré(s).`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Relève impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Déconnecter la boîte Gmail ? L'assistant ne lira plus vos e-mails.")) return;
    setBusy(true);
    try {
      await api.post("/api/email/disconnect");
      setNotice("Boîte Gmail déconnectée.");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return error ? <ErrorBanner message={error} /> : null;
  return (
    <div className="email-connection">
      <ErrorBanner message={error} />
      {notice && <div className="banner banner-ok" role="status">{notice}</div>}
      {!status.configured ? (
        <p className="muted">La connexion Gmail n'est pas encore configurée sur le serveur (voir le guide d'installation).</p>
      ) : status.connected ? (
        <>
          <p>
            Boîte connectée : <strong>{status.email}</strong>
            {status.last_sync_at && <span className="muted"> · dernière relève {formatWhen(status.last_sync_at)}</span>}
          </p>
          {status.last_error && <p className="status-echec">Dernière erreur : {status.last_error}</p>}
          <div className="presets">
            <button className="btn btn-ghost" disabled={busy} onClick={syncNow}>Relever maintenant</button>
            {isAdmin && <button className="btn btn-ghost" disabled={busy} onClick={disconnect}>Déconnecter</button>}
          </div>
        </>
      ) : (
        <>
          <p className="muted">Connectez la boîte Gmail de votre commerce. Google vous demandera votre accord.</p>
          <button className="btn btn-primary" disabled={!isAdmin || busy} onClick={connect}>
            Connecter Gmail
          </button>
        </>
      )}
    </div>
  );
}
