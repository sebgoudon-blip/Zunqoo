/**
 * Types du moteur d'audit. Ce dossier est du TypeScript pur, sans dépendance à
 * Node, Firebase ou au navigateur : il est utilisé par la Cloud Function
 * d'audit et par l'app (rapport d'exemple, export).
 */

export type Severity = "bloquant" | "important" | "conseil";
export type Category = "identite" | "domaine" | "politiques" | "produits" | "tunnel";
/** pass : conforme ; fail : à corriger ; manual : non vérifiable automatiquement. */
export type ResultStatus = "pass" | "fail" | "manual";

export type PolicyType =
  | "LEGAL_NOTICE"
  | "TERMS_OF_SERVICE"
  | "REFUND_POLICY"
  | "SHIPPING_POLICY"
  | "PRIVACY_POLICY"
  | "CONTACT_INFORMATION";

export interface SnapshotPolicy {
  type: PolicyType;
  /** Contenu HTML tel que renvoyé par Shopify. */
  body: string;
  url: string;
}

export interface SnapshotPage {
  title: string;
  handle: string;
  body: string;
  isPublished: boolean;
}

export interface SnapshotVariant {
  price: number;
  compareAtPrice: number | null;
  inventoryPolicy: "DENY" | "CONTINUE";
  barcodes: string[];
}

export interface SnapshotProduct {
  /** Identifiant global Shopify (gid://shopify/Product/123). */
  id: string;
  title: string;
  /** Description en texte brut. */
  description: string;
  vendor: string;
  hasImage: boolean;
  tracksInventory: boolean;
  totalInventory: number;
  variants: SnapshotVariant[];
}

/** Données de la boutique lues dans Shopify, normalisées pour les règles. */
export interface ShopSnapshot {
  name: string;
  contactEmail: string;
  myshopifyDomain: string;
  primaryDomain: { host: string; url: string; sslEnabled: boolean };
  address: {
    company: string;
    address1: string;
    city: string;
    zip: string;
    countryCode: string;
    phone: string;
    formatted: string[];
  };
  /** null : information non accessible. */
  passwordEnabled: boolean | null;
  policies: SnapshotPolicy[];
  /** null : pages non accessibles. */
  pages: SnapshotPage[] | null;
  /** Produits actifs analysés (au plus PRODUCT_LIMIT). */
  products: SnapshotProduct[];
  /** Nombre total de produits actifs. */
  productsTotal: number;
  /** null : zones de livraison non accessibles. */
  shipping: { countryCodes: string[]; restOfWorld: boolean } | null;
  /** Adresse saisie par l'utilisateur dans son profil, pour comparaison. */
  profileAddress?: string;
}

export interface AuditItem {
  label: string;
  detail?: string;
  url?: string;
}

export interface AuditResult {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  status: ResultStatus;
  /** Constat propre à cette boutique. */
  detail: string;
  /** Pourquoi Google peut le sanctionner. */
  why: string;
  /** Étapes concrètes de correction. */
  fix: string[];
  /** Page de documentation officielle de référence. */
  source?: string;
  /** Éléments concernés (produits, politiques…), limités à ITEM_LIMIT. */
  items?: AuditItem[];
  /** Nombre total d'éléments concernés. */
  count?: number;
}

export interface AuditReport {
  version: 2;
  shop: string;
  domain: string;
  checkedAt: number;
  score: number;
  /** Nombre de points à corriger, par gravité. */
  counts: Record<Severity, number>;
  passed: number;
  manual: number;
  productsAudited: number;
  productsTotal: number;
  results: AuditResult[];
}
