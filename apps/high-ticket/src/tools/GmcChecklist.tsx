import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon, Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";
import type { ShopAudit } from "../lib/api";

interface Item {
  text: string;
  /** Contrôles de l'audit Shopify qui valident ce point automatiquement. */
  auto?: string[];
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Identité & coordonnées",
    items: [
      { text: "La raison sociale et l'adresse du site sont identiques à l'immatriculation et à Merchant Center.", auto: ["address"] },
      { text: "Le site affiche une page Contact avec email, téléphone et adresse.", auto: ["policy_CONTACT_INFORMATION"] },
      { text: "Une page Mentions légales est accessible depuis le pied de page.", auto: ["policy_LEGAL_NOTICE"] },
      { text: "Le domaine est un nom de domaine propre (pas de .myshopify.com) et il est validé.", auto: ["domain"] },
    ],
  },
  {
    title: "Politiques",
    items: [
      { text: "Une politique de retour et de remboursement claire (délai, frais, procédure) est en ligne.", auto: ["policy_REFUND_POLICY"] },
      { text: "La politique de livraison (zones, frais, délais) est en ligne et cohérente avec Merchant Center.", auto: ["policy_SHIPPING_POLICY"] },
      { text: "Les CGV et la politique de confidentialité sont en ligne.", auto: ["policy_TERMS_OF_SERVICE", "policy_PRIVACY_POLICY"] },
      { text: "Toutes ces pages sont liées dans le pied de page." },
    ],
  },
  {
    title: "Produits & prix",
    items: [
      { text: "Le prix et la disponibilité du site correspondent exactement au flux produit." },
      { text: "Aucun prix barré fictif ni promotion permanente." },
      { text: "Aucun faux avis, faux compteur de stock ni faux minuteur." },
      { text: "Aucune marque tierce utilisée sans autorisation (titres, images, nom de domaine)." },
      { text: "L'image principale est sur fond blanc, sans texte ni filigrane." },
      { text: "Les délais de livraison affichés sur la fiche produit sont réalistes." },
    ],
  },
  {
    title: "Tunnel d'achat",
    items: [
      { text: "La boutique n'est plus protégée par mot de passe.", auto: ["password"] },
      { text: "Le paiement est sécurisé (HTTPS) et une commande test a abouti." },
      { text: "Le montant total (TVA, livraison) est visible avant le paiement." },
      { text: "Le site fonctionne sans erreur sur mobile." },
      { text: "Aucune page « en construction », aucun texte de démonstration du thème ni lien cassé." },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

type AutoState = "ok" | "ko" | null;

function autoState(item: Item, audit: ShopAudit | null): AutoState {
  if (!item.auto || !audit) return null;
  const statuses = item.auto.map((id) => audit.checks.find((c) => c.id === id)?.status);
  if (statuses.some((s) => s === "ko")) return "ko";
  if (statuses.every((s) => s === "ok")) return "ok";
  return null;
}

export function GmcChecklist() {
  const { shopify } = useAuth();
  const [checked, setChecked] = useStoredState<Record<string, boolean>>("gmc_checklist", {});
  const [audit] = useStoredState<ShopAudit | null>("shop_audit", null);

  const isChecked = (item: Item) => autoState(item, audit) === "ok" || (!!checked[item.text] && autoState(item, audit) !== "ko");
  const count = ALL_ITEMS.filter(isChecked).length;
  const percent = Math.round((count / ALL_ITEMS.length) * 100);

  return (
    <div className="card">
      {shopify ? (
        <p className="auto-banner">
          <Icon name="shield" />
          <span>
            {audit
              ? `Les points marqués « Shopify » viennent de l'audit du ${new Date(audit.checkedAt).toLocaleDateString("fr-FR")}.`
              : "Ta boutique est connectée : lance l'audit pour cocher automatiquement une partie des points."}{" "}
            <Link to="/boutique">{audit ? "Relancer l'audit" : "Lancer l'audit"}</Link>
          </span>
        </p>
      ) : (
        <p className="auto-banner">
          <Icon name="shield" />
          <span>
            <Link to="/boutique">Connecte ta boutique Shopify</Link> pour vérifier automatiquement 8 de ces points.
          </span>
        </p>
      )}
      <div className="progress-head">
        <span>
          {count}/{ALL_ITEMS.length} points conformes
        </span>
        <strong>{percent} %</strong>
      </div>
      <div className="bar" role="progressbar" aria-label="Conformité" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div style={{ width: `${percent}%` }} />
      </div>
      {SECTIONS.map((section) => (
        <fieldset key={section.title} className="checklist">
          <legend>{section.title}</legend>
          {section.items.map((item) => {
            const auto = autoState(item, audit);
            return (
              <label key={item.text} className="check">
                <input
                  type="checkbox"
                  checked={isChecked(item)}
                  disabled={auto !== null}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [item.text]: e.target.checked }))}
                />
                <span>
                  {item.text}
                  {auto && (
                    <em className={`auto-tag ${auto}`}>{auto === "ok" ? "Shopify : conforme" : "Shopify : à corriger"}</em>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      {count === ALL_ITEMS.length ? (
        <Verdict tone="good">Tu es prêt pour la revue Merchant Center.</Verdict>
      ) : (
        <Verdict tone="warn">
          Tant que la checklist n'est pas à 100 %, ne soumets pas ton compte : la première revue compte beaucoup.
        </Verdict>
      )}
    </div>
  );
}
