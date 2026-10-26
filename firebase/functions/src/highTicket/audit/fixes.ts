/**
 * Propositions de correction, calculées à partir des valeurs actuelles. Rien
 * n'est jamais appliqué sans aperçu avant/après et confirmation du marchand.
 */
import { PROMO } from "./patterns";

export type FixKind = "product_title" | "product_description" | "contact_page";

/** Contrôles de l'audit qu'une correction en un clic peut résoudre. */
export const FIX_FOR_RULE: Record<string, FixKind> = {
  products_title_promo: "product_title",
  products_title_caps: "product_title",
  products_title_length: "product_title",
  products_test_content: "product_description",
  identity_contact_page: "contact_page",
};

export const TITLE_MAX = 150;

const allMatches = (re: RegExp) => new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
const SEPARATORS = /[-–—|,:;/]/;

/** Met en minuscules un mot crié, sauf la première lettre. */
const calm = (word: string) => word.charAt(0) + word.slice(1).toLowerCase();

/**
 * Titre corrigé : sans mention promotionnelle, sans ponctuation décorative,
 * sans mots criés (à partir de deux), et de 150 caractères au plus.
 * Renvoie null s'il n'y a rien à corriger ou si le titre deviendrait vide.
 */
export function fixTitle(title: string): string | null {
  let t = title.replace(allMatches(PROMO), " ").replace(/[!?★☆✓✔→]+/g, " ");
  const words = t.split(/\s+/);
  const shouting = words.filter((w) => w.length > 4 && /\p{L}/u.test(w) && w === w.toUpperCase());
  if (shouting.length >= 2) t = words.map((w) => (shouting.includes(w) ? calm(w) : w)).join(" ");
  t = t.replace(/\s+/g, " ").trim();
  // Séparateurs orphelins après suppression : « Fauteuil – » → « Fauteuil ».
  while (t && SEPARATORS.test(t.slice(-1))) t = t.slice(0, -1).trim();
  while (t && SEPARATORS.test(t.charAt(0))) t = t.slice(1).trim();
  t = t.replace(/\s+([-–—|])\s+(?=[-–—|])/g, " ").replace(/\s{2,}/g, " ");
  if (t.length > TITLE_MAX) {
    const cut = t.slice(0, TITLE_MAX + 1);
    t = cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : TITLE_MAX).trim();
  }
  return t && t !== title ? t : null;
}

/**
 * Description sans les phrases provisoires repérées par l'audit. Renvoie null
 * si rien ne peut être retiré automatiquement (correction à faire à la main).
 */
export function fixTestContent(html: string): string | null {
  const cleaned = html
    .replace(/(?:produit de test|test product)\s*(?:[—–-]\s*)?(?:contenu provisoire)?\s*[.:!]?\s*/gi, "")
    .replace(/contenu provisoire\s*[.:!]?\s*/gi, "")
    .replace(/lorem ipsum[^<.]*\.?\s*/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .trim();
  // Rien retiré, ou il ne resterait aucun texte : la correction se fait à la main.
  if (cleaned === html.trim() || !cleaned.replace(/<[^>]+>/g, "").trim()) return null;
  return cleaned;
}

export interface ContactInfo {
  name: string;
  company: string;
  addressLines: string[];
  email: string;
  phone: string;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Contenu de la page Contact, construit uniquement à partir des réglages de la boutique. */
export function contactPageHtml(c: ContactInfo): string {
  const lines = [
    c.email && `<li>E-mail : <a href="mailto:${escape(c.email)}">${escape(c.email)}</a></li>`,
    c.phone && `<li>Téléphone : ${escape(c.phone)}</li>`,
    c.addressLines.length && `<li>Adresse : ${[c.company, ...c.addressLines].filter(Boolean).map(escape).join(", ")}</li>`,
  ].filter(Boolean);
  return `<p>Une question sur un produit ou une commande ? L'équipe ${escape(c.name)} vous répond.</p>\n<ul>\n${lines.join("\n")}\n</ul>`;
}
