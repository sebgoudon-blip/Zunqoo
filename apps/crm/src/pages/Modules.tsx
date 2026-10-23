import { useEffect, useState } from "react";
import { api, type Autonomy, type ModuleInfo, type ModulesResponse } from "../api";
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
        </>
      )}
    </>
  );
}
