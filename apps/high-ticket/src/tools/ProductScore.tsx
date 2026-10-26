import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

const CRITERIA: { id: string; label: string; hint: string }[] = [
  { id: "price", label: "Prix de vente entre 300 et 2 000 €", hint: "0 = sous 100 €, 10 = cœur de cible." },
  { id: "margin", label: "Marge avant pub ≥ 40 %", hint: "Vérifie-la dans le calculateur de rentabilité." },
  { id: "search", label: "Demande active sur Google", hint: "Volume de recherches commerciales mensuel (tâche 2.3)." },
  { id: "trend", label: "Tendance stable ou en hausse", hint: "Google Trends sur 12 mois et 5 ans." },
  { id: "competition", label: "Concurrence battable", hint: "Peu de grandes enseignes, fiches concurrentes faibles." },
  { id: "problem", label: "Résout un vrai problème / désir fort", hint: "Bénéfice clair, achat réfléchi plutôt qu'impulsif." },
  { id: "retail", label: "Introuvable en grande surface", hint: "10 = pas vendu en magasin près de chez le client." },
  { id: "sav", label: "Peu de SAV, de casse et de retours", hint: "Simple, robuste, sans montage complexe." },
  { id: "logistics", label: "Livrable rapidement en Europe", hint: "Fournisseur européen ou ligne express fiable." },
  { id: "compliance", label: "Sans risque Merchant Center", hint: "Pas de santé, de marque tierce, ni de produit réglementé." },
];

interface Candidate {
  name: string;
  values: Record<string, number>;
}

const emptyCandidate = (i: number): Candidate => ({
  name: `Produit ${i + 1}`,
  values: Object.fromEntries(CRITERIA.map((c) => [c.id, 5])),
});

export function ProductScore() {
  const [candidates, setCandidates] = useStoredState<Candidate[]>("score_candidates", [0, 1, 2].map(emptyCandidate));
  const [active, setActive] = useState(0);
  const current = candidates[active];

  const scoreOf = (c: Candidate) => CRITERIA.reduce((sum, cr) => sum + (c.values[cr.id] ?? 0), 0);

  function update(patch: Partial<Candidate>) {
    setCandidates((prev) => prev.map((c, i) => (i === active ? { ...c, ...patch } : c)));
  }

  const score = scoreOf(current);
  const blocking = (current.values.compliance ?? 0) <= 3 || (current.values.margin ?? 0) <= 3;

  return (
    <div className="tool-grid">
      <div className="card">
        <div className="tabs">
          {candidates.map((c, i) => (
            <button key={i} type="button" className={i === active ? "on" : ""} onClick={() => setActive(i)}>
              {c.name || `Produit ${i + 1}`} <em>{scoreOf(c)}</em>
            </button>
          ))}
        </div>
        <label className="field">
          <span>Nom du produit</span>
          <input value={current.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        {CRITERIA.map((cr) => (
          <label key={cr.id} className="field slider">
            <span>
              {cr.label} <b>{current.values[cr.id]}/10</b>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              value={current.values[cr.id]}
              onChange={(e) => update({ values: { ...current.values, [cr.id]: Number(e.target.value) } })}
            />
            <small>{cr.hint}</small>
          </label>
        ))}
      </div>

      <div className="card results sticky">
        <h3>Score</h3>
        <div className={`big-score ${score >= 75 ? "good" : score >= 60 ? "warn" : "bad"}`}>
          {score}
          <span>/100</span>
        </div>
        <p className="verdict">
          {blocking
            ? "❌ Critère éliminatoire : marge ou conformité Merchant Center trop faible, quel que soit le score total."
            : score >= 75
              ? "✅ Excellent candidat. Passe-le dans le calculateur de rentabilité, puis commande un échantillon."
              : score >= 60
                ? "⚠️ Candidat possible. Identifie les critères faibles et vérifie s'ils sont corrigeables."
                : "❌ À écarter. Ne dépense pas ton budget sur ce produit."}
        </p>
        <p className="muted">Les scores sont enregistrés sur cet appareil.</p>
      </div>
    </div>
  );
}
