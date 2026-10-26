import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon, Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";
import { profileSummary, publishLegal, reviewLegal, type LegalReview, type PolicyType } from "../lib/api";
import { downloadFile } from "../lib/download";
import { errorMessage } from "../lib/cloudConfig";
import { generateLegalDocs, legalDocsToHtml, type StorePolicies } from "../lib/legal";
import { validateLegalInfo } from "../lib/validation";
import { EMPTY_PROFILE, useAppState } from "../state";
import { NumberField } from "./NumberField";

const PROFILE_LABELS: Record<string, string> = {
  companyName: "Raison sociale",
  address: "Adresse",
  registrationNumber: "Immatriculation",
  vatNumber: "TVA",
  email: "Email",
  phone: "Téléphone",
  storeName: "Nom de la boutique",
  storeUrl: "URL",
};

const SEVERITY_TONE = { bloquant: "bad", important: "warn", conseil: "good" } as const;

export function LegalGenerator() {
  const { profile, policies, setPolicies } = useAppState();
  const { cloudEnabled, user, shopify } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  const [review, setReview] = useStoredState<LegalReview | null>("legal_review", null);
  const [busy, setBusy] = useState<"review" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ type: PolicyType; ok: boolean; url?: string; error?: string }[] | null>(null);

  const p = profile ?? EMPTY_PROFILE;
  const docs = generateLegalDocs(p, policies);
  const errors = validateLegalInfo(p, policies);
  const profileErrors = Object.entries(errors).filter(([k]) => k in PROFILE_LABELS);

  const set = <K extends keyof StorePolicies>(key: K, value: StorePolicies[K]) => setPolicies({ ...policies, [key]: value });

  async function copy(id: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copie le texte :", body);
    }
  }

  async function runReview() {
    setError(null);
    setBusy("review");
    try {
      setReview(
        await reviewLegal({
          country: p.country,
          profile: profileSummary(p),
          documents: docs.map((d) => ({ title: d.title, body: d.body })),
        })
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const blocking = Object.keys(errors).length;
    const message = blocking
      ? `Il reste ${blocking} point(s) à corriger dans tes informations. Publier quand même dans ${shopify?.shop} ?`
      : `Publier ces ${docs.length} pages dans les politiques de ${shopify?.shop} ? Les textes existants seront remplacés.`;
    if (!window.confirm(message)) return;
    setError(null);
    setBusy("publish");
    try {
      const res = await publishLegal({ policies: Object.fromEntries(docs.map((d) => [d.policyType, d.body])) });
      setPublished(res.results);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const downloadAll = () => downloadFile("pages-legales.html", legalDocsToHtml(docs, p.storeName), "text/html");

  const fieldError = (key: keyof StorePolicies) =>
    errors[key] ? (
      <small className="field-error" role="alert">
        {errors[key]}
      </small>
    ) : null;

  return (
    <div className="stack">
      <div className="card">
        <h3>Tes conditions de vente</h3>
        <p className="muted">
          L'identité légale vient de <Link to="/profil">ton profil</Link>.
        </p>
        <div className="grid-2">
          <label className="field">
            <span>Délai de livraison annoncé</span>
            <input value={policies.shippingDelay} onChange={(e) => set("shippingDelay", e.target.value)} />
          </label>
          <label className="field">
            <span>Frais de livraison</span>
            <input value={policies.shippingFee} placeholder="offerte, ou 9,90 €" onChange={(e) => set("shippingFee", e.target.value)} />
          </label>
        </div>
        <div className="grid-2">
          <div>
            <NumberField label="Délai de retour" value={policies.returnDays} onChange={(v) => set("returnDays", v)} suffix="jours" />
            {fieldError("returnDays")}
          </div>
          <label className="field">
            <span>Frais de retour payés par</span>
            <select
              value={policies.returnShippingPaidBy}
              onChange={(e) => set("returnShippingPaidBy", e.target.value as StorePolicies["returnShippingPaidBy"])}
            >
              <option value="boutique">La boutique</option>
              <option value="client">Le client</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Adresse de retour (si différente du siège)</span>
          <input value={policies.returnAddress} onChange={(e) => set("returnAddress", e.target.value)} />
        </label>
        {p.country === "FR" && (
          <label className="field">
            <span>Médiateur de la consommation</span>
            <input value={policies.mediator} placeholder="Nom, adresse et site du médiateur" onChange={(e) => set("mediator", e.target.value)} />
            {fieldError("mediator")}
          </label>
        )}
        <label className="field">
          <span>Garantie commerciale (optionnel)</span>
          <input
            value={policies.commercialWarranty}
            placeholder="ex. 3 ans pièces et main-d'œuvre"
            onChange={(e) => set("commercialWarranty", e.target.value)}
          />
        </label>
        <details>
          <summary>Hébergeur (Shopify par défaut)</summary>
          <label className="field">
            <span>Nom</span>
            <input value={policies.hostName} onChange={(e) => set("hostName", e.target.value)} />
          </label>
          <label className="field">
            <span>Adresse (vérifie-la sur le site de Shopify)</span>
            <input value={policies.hostAddress} onChange={(e) => set("hostAddress", e.target.value)} />
          </label>
        </details>
      </div>

      {profileErrors.length > 0 && (
        <div className="card">
          <h3>À corriger dans ton profil</h3>
          <ul className="issue-list">
            {profileErrors.map(([k, msg]) => (
              <li key={k}>
                <Icon name="warn" />
                <span>
                  <b>{PROFILE_LABELS[k]} :</b> {msg}
                </span>
              </li>
            ))}
          </ul>
          <Link className="btn btn-ghost" to="/profil">
            Compléter mon profil
          </Link>
        </div>
      )}

      {cloudEnabled && (
        <div className="card">
          <h3>Vérifier et publier</h3>
          {!user ? (
            <p>
              <Link to="/compte">Connecte-toi</Link> pour faire relire tes pages par l'IA et les publier directement dans
              ta boutique Shopify.
            </p>
          ) : (
            <>
              <p className="muted">
                La relecture IA repère les oublis, les incohérences entre pages et les points sensibles pour Merchant
                Center. Elle ne remplace pas l'avis d'un professionnel.
              </p>
              <div className="answer-buttons">
                <button className="btn btn-primary" type="button" onClick={runReview} disabled={busy !== null}>
                  <Icon name="shield" />
                  {busy === "review" ? "Relecture en cours (≈ 1 min)…" : review ? "Relancer la relecture IA" : "Relecture IA"}
                </button>
                {shopify ? (
                  <button className="btn btn-ghost" type="button" onClick={publish} disabled={busy !== null}>
                    {busy === "publish" ? "Publication…" : `Publier dans ${shopify.shop}`}
                  </button>
                ) : (
                  <Link className="btn btn-ghost" to="/boutique">
                    Connecter ma boutique pour publier
                  </Link>
                )}
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {published && (
            <ul className="audit-list">
              {published.map((r) => (
                <li key={r.type} className={r.ok ? "ok" : "ko"}>
                  <Icon name={r.ok ? "good" : "bad"} />
                  <div>
                    <strong>{docs.find((d) => d.policyType === r.type)?.title}</strong>
                    <small>
                      {r.ok ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          Voir la page publiée
                        </a>
                      ) : (
                        r.error
                      )}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {review && (
            <div className="review">
              <Verdict tone={review.issues.some((i) => i.severity === "bloquant") ? "bad" : review.issues.length ? "warn" : "good"}>
                {review.summary}
              </Verdict>
              <ul className="issue-list">
                {review.issues.map((i, idx) => (
                  <li key={idx} className={SEVERITY_TONE[i.severity]}>
                    <Icon name={SEVERITY_TONE[i.severity]} />
                    <span>
                      <b>
                        {i.document} · {i.severity}
                      </b>
                      <br />
                      {i.problem}
                      <br />
                      <em>Suggestion : {i.suggestion}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="notice">
        Ces textes sont des modèles de départ, pas un conseil juridique. Fais-les relire par un professionnel avant de
        lancer la publicité.
      </p>

      <div className="answer-buttons">
        <button className="btn btn-ghost" type="button" onClick={downloadAll}>
          <Icon name="download" />
          Télécharger toutes les pages (fichier à envoyer à un juriste)
        </button>
      </div>

      {docs.map((d) => (
        <div key={d.id} className="card doc">
          <div className="doc-head">
            <div>
              <h3>{d.title}</h3>
              <small>Shopify : {d.shopifyLocation}</small>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => copy(d.id, d.body)}>
              <Icon name={copied === d.id ? "check" : "copy"} />
              {copied === d.id ? "Copié" : "Copier"}
            </button>
          </div>
          <pre>{d.body}</pre>
        </div>
      ))}
    </div>
  );
}
