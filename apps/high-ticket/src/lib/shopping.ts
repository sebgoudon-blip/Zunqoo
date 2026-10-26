export interface TitleParts {
  brand: string;
  productType: string;
  attribute1: string;
  attribute2: string;
  variant: string;
}

export const TITLE_MAX = 150;
/** Au-delà, Google tronque souvent le titre dans les résultats Shopping. */
export const TITLE_VISIBLE = 70;

export function buildTitle(p: TitleParts): string {
  const head = [p.brand, p.productType, p.attribute1, p.attribute2].map((s) => s.trim()).filter(Boolean).join(" ");
  const variant = p.variant.trim();
  return variant ? `${head} – ${variant}` : head;
}

const PROMO = /\b(promo(tion)?s?|soldes?|offert|gratuit|pas cher|meilleur prix|prix choc|destockage|déstockage|livraison (gratuite|offerte)|black friday)\b|-\s?\d+\s?%/i;

export interface TitleCheck {
  ok: boolean;
  message: string;
}

export function checkTitle(title: string, p: TitleParts): TitleCheck[] {
  const checks: TitleCheck[] = [];
  const len = title.length;
  checks.push({
    ok: len > 0 && len <= TITLE_MAX,
    message: len > TITLE_MAX ? `Trop long : ${len} caractères (maximum ${TITLE_MAX}).` : `${len} caractères sur ${TITLE_MAX} maximum.`,
  });
  const typeIndex = p.productType.trim() ? title.toLowerCase().indexOf(p.productType.trim().toLowerCase()) : -1;
  checks.push({
    ok: typeIndex >= 0 && typeIndex + p.productType.trim().length <= TITLE_VISIBLE,
    message:
      typeIndex >= 0 && typeIndex + p.productType.trim().length <= TITLE_VISIBLE
        ? "Le type de produit est dans les 70 premiers caractères, toujours visibles."
        : "Place le type de produit dans les 70 premiers caractères : la suite est souvent coupée.",
  });
  checks.push({
    ok: !PROMO.test(title),
    message: PROMO.test(title)
      ? "Retire les mentions promotionnelles (promo, gratuit, -20 %…) : elles sont interdites dans les titres."
      : "Aucune mention promotionnelle.",
  });
  const shouting = title.split(/\s+/).filter((w) => w.length > 3 && /\p{L}/u.test(w) && w === w.toUpperCase());
  checks.push({
    ok: shouting.length === 0,
    message: shouting.length ? `Évite les mots en majuscules : ${shouting.join(", ")}.` : "Pas de majuscules abusives.",
  });
  checks.push({
    ok: !/[!?]{1,}|[★☆✓✔→]/.test(title),
    message: /[!?]|[★☆✓✔→]/.test(title) ? "Retire les points d'exclamation et symboles décoratifs." : "Ponctuation sobre.",
  });
  return checks;
}

export interface NegativeGroup {
  id: string;
  label: string;
  keywords: string[];
}

export const NEGATIVE_GROUPS: NegativeGroup[] = [
  { id: "free", label: "Gratuit & petits prix", keywords: ["gratuit", "gratuite", "pas cher", "moins cher", "low cost", "discount"] },
  { id: "used", label: "Occasion & location", keywords: ["occasion", "seconde main", "reconditionné", "leboncoin", "vinted", "location", "louer"] },
  { id: "info", label: "Recherche d'informations", keywords: ["notice", "mode d'emploi", "pdf", "tuto", "tutoriel", "comment", "avis forum", "définition"] },
  { id: "repair", label: "Réparation & pièces", keywords: ["réparation", "réparer", "pièce détachée", "pièces détachées", "panne", "sav"] },
  { id: "diy", label: "Fabrication maison", keywords: ["fabriquer", "faire soi-même", "diy", "plan de fabrication", "tuto fabrication"] },
  { id: "jobs", label: "Emploi & formation", keywords: ["emploi", "recrutement", "salaire", "stage", "formation"] },
];

export function buildNegatives(groupIds: string[], competitors: string, custom: string): string[] {
  const words = NEGATIVE_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.keywords);
  const extra = `${competitors}\n${custom}`
    .split(/[\n,;]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...words, ...extra])];
}
