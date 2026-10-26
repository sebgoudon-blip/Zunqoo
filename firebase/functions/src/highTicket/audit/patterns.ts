/** Expressions partagées par les règles d'audit et les propositions de correction. */

/** Mentions promotionnelles interdites dans les titres. */
export const PROMO =
  /\b(promo(tion)?s?|soldes?|offerte?s?|gratuite?s?|pas cher|meilleur prix|prix choc|d[ée]stockage|livraison (gratuite|offerte)|black friday|free shipping|best ?seller|n°\s?1)\b|-\s?\d+\s?%/i;

/** Textes provisoires oubliés dans une fiche produit. */
export const TEST_CONTENT =
  /produit de test|contenu provisoire|lorem ipsum|test product|placeholder|texte (?:provisoire|temporaire)|description (?:a venir|à venir)/i;
