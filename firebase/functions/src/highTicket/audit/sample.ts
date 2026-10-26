import type { ShopSnapshot, SnapshotProduct } from "./types";

/**
 * Boutique fictive utilisée pour le rapport d'exemple et les tests. Elle
 * cumule volontairement des problèmes fréquents. Toute ressemblance avec une
 * boutique réelle serait fortuite.
 */

const product = (id: number, overrides: Partial<SnapshotProduct> = {}): SnapshotProduct => ({
  id: `gid://shopify/Product/${id}`,
  title: `Fauteuil en chêne massif modèle ${id}`,
  description:
    "Fauteuil fabriqué en chêne massif issu de forêts gérées durablement. Assise en lin lavé, déhoussable. Dimensions : 72 x 80 x 85 cm. Livré monté, avec notice d'entretien.",
  vendor: "Maison Exemple",
  hasImage: true,
  tracksInventory: true,
  totalInventory: 12,
  variants: [{ price: 890, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: ["4006381333931"] }],
  ...overrides,
});

const REFUND = `<h2>Retours</h2><p>Vous disposez de 30 jours après réception pour nous retourner un article. Les frais de retour sont à la charge du client.</p><p>Le remboursement intervient sous 14 jours après réception du retour.</p>`;
const TERMS = `<h2>Article 7 – Droit de rétractation</h2><p>Conformément à la loi, le client dispose d'un délai de 14 jours pour exercer son droit de rétractation et retourner le produit.</p><p>[Nom de l'entreprise], SAS au capital de [montant] €, immatriculée au RCS de [ville].</p>`;
const DETAILS = `<p>Pour toute question, notre service client répond du lundi au vendredi, de 9 h à 18 h, par email ou par téléphone. Les articles doivent être retournés dans leur emballage d'origine, complets et en parfait état.</p>`;
const LEGAL = `<p>Le site est édité par Maison Exemple SAS, 12 rue des Artisans, 69002 Lyon. Email : bonjour@maison-exemple.test. Téléphone : 04 78 00 00 00.</p>`;

export const SAMPLE_SNAPSHOT: ShopSnapshot = {
  name: "Maison Exemple (boutique fictive)",
  contactEmail: "contact@maison-exemple.test",
  myshopifyDomain: "maison-exemple.myshopify.com",
  primaryDomain: { host: "maison-exemple.test", url: "https://maison-exemple.test", sslEnabled: true },
  address: {
    company: "Maison Exemple SAS",
    address1: "12 rue des Artisans",
    city: "Lyon",
    zip: "69002",
    countryCode: "FR",
    phone: "+33 4 78 00 00 00",
    formatted: ["Maison Exemple SAS", "12 rue des Artisans", "69002 Lyon", "France"],
  },
  passwordEnabled: false,
  policies: [
    { type: "REFUND_POLICY", body: REFUND + DETAILS, url: "https://maison-exemple.test/policies/refund-policy" },
    { type: "TERMS_OF_SERVICE", body: TERMS + DETAILS, url: "https://maison-exemple.test/policies/terms-of-service" },
    { type: "LEGAL_NOTICE", body: LEGAL + DETAILS, url: "https://maison-exemple.test/policies/legal-notice" },
    { type: "PRIVACY_POLICY", body: "<p>Nous respectons votre vie privée.</p>", url: "https://maison-exemple.test/policies/privacy-policy" },
  ],
  pages: [],
  products: [
    product(1),
    product(2, { title: "Fauteuil scandinave PROMO -40% livraison offerte", variants: [{ price: 450, compareAtPrice: 1290, inventoryPolicy: "DENY", barcodes: [] }] }),
    product(3, { hasImage: false }),
    product(4, { title: "Lampe de bureau Louis Vuitton en laiton", variants: [{ price: 320, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: ["12345"] }] }),
    product(5, { totalInventory: 0 }),
  ],
  productsTotal: 5,
  shipping: { countryCodes: ["FR", "BE", "LU", "CH"], restOfWorld: false },
};
