import type { Country, ToolId } from "../types";

export const TOOL_LABELS: Record<ToolId, string> = {
  profit: "Calculateur de rentabilité",
  score: "Score produit high-ticket",
  ads: "Planificateur Google Ads",
  legal: "Générateur de pages légales",
  gmc: "Checklist Merchant Center",
  titles: "Titres Shopping & mots-clés négatifs",
  tracker: "Suivi quotidien Google Ads",
};

export const TOOL_DESCRIPTIONS: Record<ToolId, string> = {
  profit: "Marge réelle, CPA maximum et ROAS de rentabilité à partir de ton prix et de tes coûts.",
  score: "Note un produit sur 100 selon 10 critères high-ticket avant d'investir.",
  ads: "Budget quotidien, clics, ventes attendues et règle de coupe pour ta campagne Shopping.",
  legal: "Mentions légales, CGV, retours, livraison et confidentialité pré-remplies avec ton profil.",
  gmc: "Les points vérifiés par Google avant d'approuver ton compte Merchant Center.",
  titles: "Construis des titres de flux conformes et ta liste de mots-clés négatifs Google Ads.",
  tracker: "Note tes chiffres chaque jour : ROAS, CPC et règle de coupe calculés automatiquement.",
};

export const TOOL_ORDER: ToolId[] = ["score", "profit", "legal", "gmc", "titles", "ads", "tracker"];

export const STANDARD_VAT: Record<Country, number> = { FR: 20, BE: 21, LU: 17, CH: 8.1 };
