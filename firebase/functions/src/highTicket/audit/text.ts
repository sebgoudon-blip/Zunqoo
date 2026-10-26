/** Outils d'analyse de texte pour les règles d'audit. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  euro: "€",
  rsquo: "’",
};

/** Convertit du HTML Shopify en texte brut lisible. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Minuscules, sans accents : pour comparer des textes saisis différemment. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export const digitsOf = (text: string) => text.replace(/\D/g, "");

export function emailsIn(text: string): string[] {
  return [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
}

/**
 * Le numéro apparaît-il dans le texte ? On compare les 9 derniers chiffres pour
 * accepter « +33 6 12 34 56 78 » comme « 06.12.34.56.78 ».
 */
export function phoneIn(phone: string, text: string): boolean {
  const tail = digitsOf(phone).slice(-9);
  return tail.length >= 8 && digitsOf(text).includes(tail);
}

/** Durées en jours citées dans les phrases qui parlent de retour ou de remboursement. */
export function returnDelays(text: string): number[] {
  const delays = new Set<number>();
  for (const sentence of normalize(text).split(/[.\n;!?]/)) {
    if (!/retour|retract|rembours|renvo|changer d.avis|prolong|return|refund/.test(sentence)) continue;
    for (const m of sentence.matchAll(/\b(\d{1,3})\s*(?:jours?|days?)\b/g)) delays.add(Number(m[1]));
  }
  return [...delays].sort((a, b) => a - b);
}

/** Le texte mentionne-t-il une durée (jours, semaines, heures ouvrées) ? */
export function mentionsDelay(text: string): boolean {
  return /\b\d{1,3}\s*(?:(?:a|-|–|to|et|and)\s*\d{1,3}\s*)?(?:jours?|days?|semaines?|weeks?|heures?|hours?|h)\b/.test(normalize(text));
}

/** Traces d'un modèle non rempli : [Nom], lorem ipsum, XXX… */
export function placeholdersIn(text: string): string[] {
  const found = text.match(/\[[^\]\n]{2,120}\]|lorem ipsum|\bX{3,}\b|\{\{[^}]*\}\}|à compléter|a completer|votre (?:raison sociale|adresse|entreprise|nom de société)/gi);
  return [...new Set(found ?? [])].slice(0, 5);
}

/** Vérifie un GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) : longueur et chiffre de contrôle. */
export function validGtin(code: string): boolean {
  const value = code.replace(/\s/g, "");
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
