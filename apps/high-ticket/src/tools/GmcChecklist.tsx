import { Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Identité & coordonnées",
    items: [
      "La raison sociale et l'adresse du site sont identiques à l'immatriculation et à Merchant Center.",
      "Le site affiche une page Contact avec email, téléphone et adresse.",
      "Une page Mentions légales est accessible depuis le pied de page.",
      "Le domaine est un nom de domaine propre (pas de .myshopify.com) et il est validé.",
    ],
  },
  {
    title: "Politiques",
    items: [
      "Une politique de retour et de remboursement claire (délai, frais, procédure) est en ligne.",
      "La politique de livraison (zones, frais, délais) est en ligne et cohérente avec Merchant Center.",
      "Les CGV et la politique de confidentialité sont en ligne.",
      "Toutes ces pages sont liées dans le pied de page.",
    ],
  },
  {
    title: "Produits & prix",
    items: [
      "Le prix et la disponibilité du site correspondent exactement au flux produit.",
      "Aucun prix barré fictif ni promotion permanente.",
      "Aucun faux avis, faux compteur de stock ni faux minuteur.",
      "Aucune marque tierce utilisée sans autorisation (titres, images, nom de domaine).",
      "L'image principale est sur fond blanc, sans texte ni filigrane.",
      "Les délais de livraison affichés sur la fiche produit sont réalistes.",
    ],
  },
  {
    title: "Tunnel d'achat",
    items: [
      "La boutique n'est plus protégée par mot de passe.",
      "Le paiement est sécurisé (HTTPS) et une commande test a abouti.",
      "Le montant total (TVA, livraison) est visible avant le paiement.",
      "Le site fonctionne sans erreur sur mobile.",
      "Aucune page « en construction », aucun texte de démonstration du thème ni lien cassé.",
    ],
  },
];

const TOTAL = SECTIONS.reduce((n, s) => n + s.items.length, 0);

export function GmcChecklist() {
  const [checked, setChecked] = useStoredState<Record<string, boolean>>("gmc_checklist", {});
  const count = Object.values(checked).filter(Boolean).length;
  const percent = Math.round((count / TOTAL) * 100);

  return (
    <div className="card">
      <div className="progress-head">
        <span>
          {count}/{TOTAL} points conformes
        </span>
        <strong>{percent} %</strong>
      </div>
      <div className="bar" role="progressbar" aria-label="Conformité" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div style={{ width: `${percent}%` }} />
      </div>
      {SECTIONS.map((section) => (
        <fieldset key={section.title} className="checklist">
          <legend>{section.title}</legend>
          {section.items.map((item) => (
            <label key={item} className="check">
              <input
                type="checkbox"
                checked={!!checked[item]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [item]: e.target.checked }))}
              />
              <span>{item}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {count === TOTAL ? (
        <Verdict tone="good">Tu es prêt pour la revue Merchant Center.</Verdict>
      ) : (
        <Verdict tone="warn">
          Tant que la checklist n'est pas à 100 %, ne soumets pas ton compte : la première revue compte beaucoup.
        </Verdict>
      )}
    </div>
  );
}
