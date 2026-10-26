import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { generateLegalDocs, type StorePolicies } from "../lib/legal";
import { EMPTY_PROFILE, useAppState } from "../state";
import { NumberField } from "./NumberField";

export function LegalGenerator() {
  const { profile, policies, setPolicies } = useAppState();
  const [copied, setCopied] = useState<string | null>(null);
  const docs = generateLegalDocs(profile ?? EMPTY_PROFILE, policies);

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

  const missing = docs.some((d) => d.body.includes("["));

  return (
    <div className="stack">
      <div className="card">
        <h3>Tes conditions de vente</h3>
        <p className="muted">
          L'identité légale vient de <Link to="/profil">ton profil</Link>. Les champs entre [crochets] dans les textes
          sont à compléter.
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
          <NumberField label="Délai de retour" value={policies.returnDays} onChange={(v) => set("returnDays", v)} suffix="jours" />
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
        {profile?.country === "FR" && (
          <label className="field">
            <span>Médiateur de la consommation</span>
            <input value={policies.mediator} placeholder="Nom, adresse et site du médiateur" onChange={(e) => set("mediator", e.target.value)} />
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

      {missing && <p className="notice">Certains champs restent à compléter : ils apparaissent entre [crochets].</p>}
      <p className="notice">
        Ces textes sont des modèles de départ, pas un conseil juridique. Fais-les relire par un professionnel avant de
        lancer la publicité.
      </p>

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
