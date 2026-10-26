import { useState } from "react";
import { Icon, Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";
import { NEGATIVE_GROUPS, TITLE_MAX, buildNegatives, buildTitle, checkTitle, type TitleParts } from "../lib/shopping";

interface NegativeSettings {
  groups: string[];
  competitors: string;
  custom: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copie le texte :", text);
    return false;
  }
}

export function ShoppingTitles() {
  const [parts, setParts] = useStoredState<TitleParts>("title_parts", {
    brand: "",
    productType: "",
    attribute1: "",
    attribute2: "",
    variant: "",
  });
  const [neg, setNeg] = useStoredState<NegativeSettings>("negative_settings", {
    groups: NEGATIVE_GROUPS.map((g) => g.id),
    competitors: "",
    custom: "",
  });
  const [copied, setCopied] = useState<"title" | "neg" | null>(null);

  const title = buildTitle(parts);
  const checks = title ? checkTitle(title, parts) : [];
  const failing = checks.filter((c) => !c.ok).length;
  const negatives = buildNegatives(neg.groups, neg.competitors, neg.custom);

  const field = (key: keyof TitleParts, label: string, placeholder: string, hint?: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={parts[key]} placeholder={placeholder} onChange={(e) => setParts((p) => ({ ...p, [key]: e.target.value }))} />
      {hint && <small>{hint}</small>}
    </label>
  );

  async function copy(kind: "title" | "neg", text: string) {
    if (await copyText(text)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <div className="stack">
      <div className="tool-grid">
        <div className="card">
          <h3>Titre du produit (flux Shopping)</h3>
          {field("brand", "Marque", "Ma Marque", "Le nom de ta boutique si le produit est en marque blanche.")}
          {field("productType", "Type de produit", "Bureau assis-debout électrique", "Les mots que tes clients tapent dans Google.")}
          <div className="grid-2">
            {field("attribute1", "Attribut clé", "Double moteur")}
            {field("attribute2", "Dimension / capacité", "160 x 80 cm")}
          </div>
          {field("variant", "Modèle / couleur", "Chêne clair")}
        </div>
        <div className="card results sticky">
          <h3>Résultat</h3>
          {title ? (
            <>
              <p className="title-preview">{title}</p>
              <div className="bar" role="progressbar" aria-label="Longueur du titre" aria-valuemin={0} aria-valuemax={TITLE_MAX} aria-valuenow={title.length}>
                <div style={{ width: `${Math.min(100, (title.length / TITLE_MAX) * 100)}%` }} />
              </div>
              <ul className="issue-list compact">
                {checks.map((c) => (
                  <li key={c.message} className={c.ok ? "good" : "bad"}>
                    <Icon name={c.ok ? "good" : "bad"} />
                    <span>{c.message}</span>
                  </li>
                ))}
              </ul>
              {failing === 0 ? (
                <Verdict tone="good">Titre conforme aux bonnes pratiques Shopping.</Verdict>
              ) : (
                <Verdict tone="warn">{failing} point(s) à corriger.</Verdict>
              )}
              <button className="btn btn-primary" type="button" onClick={() => copy("title", title)}>
                <Icon name={copied === "title" ? "check" : "copy"} />
                {copied === "title" ? "Copié" : "Copier le titre"}
              </button>
            </>
          ) : (
            <p className="muted">Remplis au moins la marque et le type de produit.</p>
          )}
        </div>
      </div>

      <div className="tool-grid">
        <div className="card">
          <h3>Mots-clés négatifs</h3>
          <p className="muted">Ils évitent de payer des clics de personnes qui ne veulent pas acheter un produit neuf.</p>
          <fieldset className="checklist">
            <legend>Familles à exclure</legend>
            {NEGATIVE_GROUPS.map((g) => (
              <label key={g.id} className="check">
                <input
                  type="checkbox"
                  checked={neg.groups.includes(g.id)}
                  onChange={(e) =>
                    setNeg((n) => ({ ...n, groups: e.target.checked ? [...n.groups, g.id] : n.groups.filter((x) => x !== g.id) }))
                  }
                />
                <span>
                  {g.label}
                  <small className="muted block">{g.keywords.join(", ")}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>Marques concurrentes que tu ne vends pas</span>
            <textarea rows={2} value={neg.competitors} placeholder="Une par ligne ou séparées par des virgules" onChange={(e) => setNeg((n) => ({ ...n, competitors: e.target.value }))} />
          </label>
          <label className="field">
            <span>Autres termes (issus du rapport des termes de recherche)</span>
            <textarea rows={2} value={neg.custom} onChange={(e) => setNeg((n) => ({ ...n, custom: e.target.value }))} />
          </label>
        </div>
        <div className="card results sticky">
          <h3>{negatives.length} mots-clés à exclure</h3>
          <pre className="keyword-list">{negatives.join("\n")}</pre>
          <p className="muted">À coller dans Google Ads : Campagne &gt; Mots-clés &gt; Mots-clés à exclure (un par ligne).</p>
          <button className="btn btn-primary" type="button" disabled={!negatives.length} onClick={() => copy("neg", negatives.join("\n"))}>
            <Icon name={copied === "neg" ? "check" : "copy"} />
            {copied === "neg" ? "Copié" : "Copier la liste"}
          </button>
        </div>
      </div>
    </div>
  );
}
