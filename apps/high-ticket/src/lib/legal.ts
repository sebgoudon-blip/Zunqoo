import type { Profile } from "../types";
import type { PolicyType } from "./api";

export interface StorePolicies {
  hostName: string;
  hostAddress: string;
  shippingDelay: string;
  shippingFee: string;
  returnDays: number;
  returnShippingPaidBy: "client" | "boutique";
  returnAddress: string;
  mediator: string;
  commercialWarranty: string;
}

export const DEFAULT_POLICIES: StorePolicies = {
  hostName: "Shopify International Limited",
  hostAddress: "Victoria Buildings, 2ᵉ étage, 1-2 Haddington Road, Dublin 4, D04 XN32, Irlande",
  shippingDelay: "2 à 5 jours ouvrés",
  shippingFee: "offerte",
  returnDays: 30,
  returnShippingPaidBy: "boutique",
  returnAddress: "",
  mediator: "",
  commercialWarranty: "",
};

const blank = (v: string, label: string) => (v.trim() ? v.trim() : `[${label}]`);

export interface LegalDoc {
  id: string;
  title: string;
  shopifyLocation: string;
  /** Politique Shopify dans laquelle le texte est publié. */
  policyType: PolicyType;
  body: string;
}

export function generateLegalDocs(p: Profile, s: StorePolicies): LegalDoc[] {
  const company = blank(p.companyName, "Raison sociale");
  const store = blank(p.storeName, "Nom de la boutique");
  const url = blank(p.storeUrl, "URL du site");
  const address = blank(p.address, "Adresse du siège");
  const email = blank(p.email, "Email de contact");
  const phone = blank(p.phone, "Téléphone");
  const reg = blank(p.registrationNumber, "Numéro d'immatriculation");
  const returnAddress = s.returnAddress.trim() || address;
  const euConsumer = p.country !== "CH";

  const mentions = `MENTIONS LÉGALES

Éditeur du site
Le site ${url} (« ${store} ») est édité par ${company}${p.legalForm ? `, ${p.legalForm}` : ""}.
Siège social : ${address}
Immatriculation : ${reg}
${p.vatNumber.trim() ? `N° de TVA : ${p.vatNumber.trim()}\n` : ""}Email : ${email}
Téléphone : ${phone}
Directeur de la publication : ${blank(p.firstName, "Nom du responsable")}

Hébergement
${s.hostName}
${s.hostAddress}

Propriété intellectuelle
L'ensemble des contenus du site (textes, images, vidéos, logo) est la propriété de ${company} ou utilisé avec autorisation. Toute reproduction sans accord préalable est interdite.

Données personnelles
Le traitement de vos données est décrit dans notre Politique de confidentialité.`;

  const shipping = `POLITIQUE DE LIVRAISON

Zones de livraison
Nous livrons dans les pays proposés lors de la commande.

Frais de livraison
La livraison est ${s.shippingFee}.

Délais
Les commandes sont livrées en ${s.shippingDelay} après validation du paiement. Un numéro de suivi est envoyé par email dès l'expédition.

Réception
Vérifiez l'état du colis en présence du transporteur. En cas de dommage, émettez des réserves précises auprès du transporteur et contactez-nous sous 48 h à ${email}, photos à l'appui.`;

  const returns = `POLITIQUE DE RETOUR ET DE REMBOURSEMENT

Délai de retour
Vous disposez de ${s.returnDays} jours à compter de la réception de votre commande pour nous retourner un produit, sans avoir à justifier de motif${euConsumer && s.returnDays > 14 ? " (le délai légal de rétractation est de 14 jours ; nous l'étendons volontairement)" : ""}.

Procédure
1. Informez-nous de votre décision par email à ${email}, en indiquant votre numéro de commande.
2. Renvoyez le produit complet, dans son emballage d'origine si possible, à l'adresse suivante :
${returnAddress}

Frais de retour
Les frais de retour sont à la charge ${s.returnShippingPaidBy === "boutique" ? `de ${store}. Nous vous fournissons une étiquette de retour.` : "du client."}

Remboursement
Le remboursement intervient au plus tard 14 jours après réception de votre demande, sur le moyen de paiement utilisé lors de l'achat. Nous pouvons différer le remboursement jusqu'à réception du produit.

Produits endommagés ou non conformes
Contactez-nous à ${email} : nous prenons en charge le retour et l'échange ou le remboursement.`;

  const terms = `CONDITIONS GÉNÉRALES DE VENTE

Article 1 – Objet
Les présentes conditions régissent les ventes réalisées sur ${url} par ${company}, ${address}, immatriculée sous ${reg}.

Article 2 – Prix
Les prix sont indiqués en euros, toutes taxes comprises. Les frais de livraison éventuels sont indiqués avant la validation de la commande.

Article 3 – Commande
La commande est définitive après validation du paiement. Un email de confirmation récapitule la commande.

Article 4 – Paiement
Le paiement s'effectue en ligne par les moyens proposés lors de la commande. Les paiements sont sécurisés par nos prestataires de paiement.

Article 5 – Livraison
Les conditions de livraison sont décrites dans notre Politique de livraison (délai : ${s.shippingDelay}).

Article 6 – Droit de rétractation
${euConsumer ? `Conformément à la réglementation applicable, le client consommateur dispose d'un délai de 14 jours à compter de la réception pour exercer son droit de rétractation. ${store} étend ce délai à ${s.returnDays} jours. ` : `Le client dispose de ${s.returnDays} jours à compter de la réception pour retourner un produit. `}Les modalités figurent dans notre Politique de retour.

Article 7 – Garanties
${euConsumer ? "Les produits bénéficient de la garantie légale de conformité (2 ans à compter de la livraison) et de la garantie contre les vices cachés." : "Les produits bénéficient des garanties légales applicables."}${s.commercialWarranty.trim() ? `\nGarantie commerciale : ${s.commercialWarranty.trim()}` : ""}

Article 8 – Service client
Pour toute question : ${email} – ${phone}.

Article 9 – Médiation
${p.country === "FR" ? `En cas de litige non résolu, le client peut recourir gratuitement au médiateur de la consommation : ${blank(s.mediator, "Nom et coordonnées du médiateur")}.` : "En cas de litige non résolu, le client peut recourir à un organisme de règlement extrajudiciaire des litiges compétent dans son pays."}

Article 10 – Droit applicable
Les présentes conditions sont soumises au droit du pays du siège de ${company}, sans préjudice des dispositions protectrices du pays de résidence du consommateur.`;

  const privacy = `POLITIQUE DE CONFIDENTIALITÉ

Responsable du traitement
${company}, ${address} – ${email}.

Données collectées
Identité, coordonnées, adresse de livraison, historique de commandes et données de navigation (cookies, avec votre consentement).

Finalités
Traitement des commandes, service client, prévention de la fraude, mesure d'audience et publicité (avec consentement).

Destinataires
Notre plateforme e-commerce, nos prestataires de paiement, de livraison et de publicité, dans la limite nécessaire.

Durée de conservation
Les données clients sont conservées pendant la durée de la relation commerciale, puis archivées selon les obligations légales (comptables notamment).

Vos droits
Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de portabilité. Écrivez à ${email}. Vous pouvez introduire une réclamation auprès de l'autorité de protection des données de votre pays.`;

  const contact = `COORDONNÉES

${company}
${address}
Email : ${email}
Téléphone : ${phone}
Immatriculation : ${reg}${p.vatNumber.trim() ? `\nN° de TVA : ${p.vatNumber.trim()}` : ""}`;

  return [
    { id: "mentions", title: "Mentions légales", shopifyLocation: "Paramètres > Politiques > Mentions légales", policyType: "LEGAL_NOTICE", body: mentions },
    { id: "terms", title: "Conditions générales de vente", shopifyLocation: "Paramètres > Politiques > Conditions d'utilisation", policyType: "TERMS_OF_SERVICE", body: terms },
    { id: "returns", title: "Politique de retour", shopifyLocation: "Paramètres > Politiques > Politique de retour et de remboursement", policyType: "REFUND_POLICY", body: returns },
    { id: "shipping", title: "Politique de livraison", shopifyLocation: "Paramètres > Politiques > Politique d'expédition", policyType: "SHIPPING_POLICY", body: shipping },
    { id: "privacy", title: "Politique de confidentialité", shopifyLocation: "Paramètres > Politiques > Politique de confidentialité", policyType: "PRIVACY_POLICY", body: privacy },
    { id: "contact", title: "Coordonnées", shopifyLocation: "Paramètres > Politiques > Coordonnées", policyType: "CONTACT_INFORMATION", body: contact },
  ];
}
