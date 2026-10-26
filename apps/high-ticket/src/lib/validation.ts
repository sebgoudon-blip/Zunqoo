import type { Profile } from "../types";
import type { StorePolicies } from "./legal";

export type FieldErrors = Partial<Record<keyof Profile | keyof StorePolicies, string>>;

const digits = (v: string) => v.replace(/\D/g, "");

/**
 * Contrôles de forme sur les informations légales : ils attrapent les fautes de
 * frappe et les oublis, sans prétendre vérifier l'existence de l'entreprise.
 */
export function validateLegalInfo(p: Profile, s: StorePolicies): FieldErrors {
  const e: FieldErrors = {};
  const v = (x: string) => x.trim();

  if (!v(p.companyName)) e.companyName = "Raison sociale manquante.";
  if (!v(p.address)) e.address = "Adresse du siège manquante.";
  else if (!/\b\d{4,5}\b/.test(p.address)) e.address = "Ajoute le code postal à l'adresse.";

  const reg = digits(p.registrationNumber);
  if (!v(p.registrationNumber)) e.registrationNumber = "Numéro d'immatriculation manquant.";
  else if (p.country === "FR" && reg.length !== 9 && reg.length !== 14) {
    e.registrationNumber = "En France : SIREN à 9 chiffres ou SIRET à 14 chiffres.";
  } else if (p.country === "BE" && reg.length !== 10) {
    e.registrationNumber = "En Belgique : numéro d'entreprise BCE à 10 chiffres.";
  }

  const vat = p.vatNumber.replace(/\s/g, "").toUpperCase();
  if (vat && p.country !== "CH" && !vat.startsWith(p.country)) {
    e.vatNumber = `Un numéro de TVA ${p.country} commence par « ${p.country} ».`;
  } else if (vat && p.country === "FR" && !/^FR[0-9A-Z]{2}\d{9}$/.test(vat)) {
    e.vatNumber = "Format attendu : FR + 2 caractères + SIREN (13 caractères au total).";
  }

  if (!v(p.email)) e.email = "Email de contact manquant.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) e.email = "Adresse email invalide.";
  else if (/@(gmail|hotmail|yahoo|outlook|live|icloud)\./i.test(p.email)) {
    e.email = "Préfère une adresse sur ton domaine (contact@tamarque.fr) : elle inspire plus confiance.";
  }

  if (!v(p.phone)) e.phone = "Téléphone manquant.";
  else if (digits(p.phone).length < 9) e.phone = "Numéro de téléphone incomplet.";

  if (!v(p.storeName)) e.storeName = "Nom de la boutique manquant.";
  if (!v(p.storeUrl)) e.storeUrl = "URL de la boutique manquante.";
  else if (!/^https:\/\/[^\s/]+\.[a-z]{2,}/i.test(p.storeUrl)) e.storeUrl = "L'URL doit commencer par https:// (ex. https://www.tamarque.fr).";
  else if (/myshopify\.com/i.test(p.storeUrl)) e.storeUrl = "Utilise ton propre nom de domaine, pas l'adresse .myshopify.com.";

  if (p.country === "FR" && !v(s.mediator)) e.mediator = "Le médiateur de la consommation est obligatoire en France.";
  if (s.returnDays < 14 && p.country !== "CH") e.returnDays = "Le délai de rétractation légal est de 14 jours minimum.";

  return e;
}
