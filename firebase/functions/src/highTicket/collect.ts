import { PRODUCT_LIMIT, type PolicyType, type ShopSnapshot, type SnapshotProduct } from "./audit";

/** Requête GraphQL Admin vers la boutique, avec un jeton déjà valide. */
export type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<GqlResult<T>>;

export interface GqlResult<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

const PAGE_SIZE = 20;
const MAX_THROTTLE_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Relance la requête quand Shopify limite le débit (erreur THROTTLED). */
async function withRetry<T>(gql: Gql, query: string, variables?: Record<string, unknown>, wait = sleep): Promise<GqlResult<T>> {
  for (let attempt = 0; ; attempt++) {
    const res = await gql<T>(query, variables);
    const throttled = res.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (!throttled || attempt >= MAX_THROTTLE_RETRIES) return res;
    await wait(1000 * 2 ** attempt);
  }
}

/** Partie d'une requête qui peut être refusée (accès manquant) sans faire échouer l'audit. */
async function optional<T>(gql: Gql, query: string): Promise<T | null> {
  try {
    const res = await withRetry<T>(gql, query);
    return res.errors?.length || !res.data ? null : res.data;
  } catch {
    return null;
  }
}

interface ShopData {
  shop: {
    name: string;
    contactEmail: string;
    myshopifyDomain: string;
    primaryDomain: { host: string; url: string; sslEnabled: boolean };
    shopAddress: {
      company: string | null;
      address1: string | null;
      city: string | null;
      zip: string | null;
      countryCodeV2: string | null;
      phone: string | null;
      formatted: string[];
    };
    shopPolicies: { type: PolicyType; body: string; url: string }[];
  };
  productsCount: { count: number } | null;
}

interface ProductsData {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      title: string;
      description: string;
      vendor: string;
      tracksInventory: boolean;
      totalInventory: number;
      featuredMedia: { id: string } | null;
      variants: {
        nodes: {
          price: string;
          compareAtPrice: string | null;
          inventoryPolicy: "DENY" | "CONTINUE";
          barcodes: { nodes: { value: string }[] };
        }[];
      };
    }[];
  };
}

// Accès nécessaires : read_legal_policies (politiques), read_products (produits).
export const SHOP_QUERY = `query HtpAuditShop {
  shop {
    name
    contactEmail
    myshopifyDomain
    primaryDomain { host url sslEnabled }
    shopAddress { company address1 city zip countryCodeV2 phone formatted }
    shopPolicies { type body url }
  }
  productsCount(query: "status:active") { count }
}`;

// Coût estimé par page : 20 produits × (1 + 1 + 10 variantes × 3) ≈ 650 points,
// sous la limite de 1 000 points par requête.
export const PRODUCTS_QUERY = `query HtpAuditProducts($after: String) {
  products(first: ${PAGE_SIZE}, after: $after, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      description(truncateAt: 1000)
      vendor
      tracksInventory
      totalInventory
      featuredMedia { id }
      variants(first: 10) {
        nodes { price compareAtPrice inventoryPolicy barcodes(first: 2) { nodes { value } } }
      }
    }
  }
}`;

// Requêtes séparées : si un accès manque, le reste de l'audit reste valable.
export const PASSWORD_QUERY = `query HtpAuditPassword { onlineStore { passwordProtection { enabled } } }`;
export const PAGES_QUERY = `query HtpAuditPages { pages(first: 50) { nodes { title handle body isPublished } } }`;
export const SHIPPING_QUERY = `query HtpAuditShipping { shop { countriesInShippingZones { countryCodes includeRestOfWorld } } }`;

/** Lit dans Shopify, en lecture seule, tout ce dont les règles d'audit ont besoin. */
export async function collectSnapshot(gql: Gql, options: { profileAddress?: string; wait?: typeof sleep } = {}): Promise<ShopSnapshot> {
  const main = await withRetry<ShopData>(gql, SHOP_QUERY, undefined, options.wait);
  if (!main.data?.shop) {
    throw new Error(`Lecture de la boutique impossible : ${main.errors?.map((e) => e.message).join("; ") ?? "réponse vide"}`);
  }
  const { shop } = main.data;

  const [password, pages, shipping] = await Promise.all([
    optional<{ onlineStore: { passwordProtection: { enabled: boolean } } }>(gql, PASSWORD_QUERY),
    optional<{ pages: { nodes: { title: string; handle: string; body: string; isPublished: boolean }[] } }>(gql, PAGES_QUERY),
    optional<{ shop: { countriesInShippingZones: { countryCodes: string[]; includeRestOfWorld: boolean } } }>(gql, SHIPPING_QUERY),
  ]);

  const products: SnapshotProduct[] = [];
  let after: string | null = null;
  while (products.length < PRODUCT_LIMIT) {
    const page: GqlResult<ProductsData> = await withRetry<ProductsData>(gql, PRODUCTS_QUERY, { after }, options.wait);
    if (!page.data) {
      throw new Error(`Lecture des produits impossible : ${page.errors?.map((e) => e.message).join("; ") ?? "réponse vide"}`);
    }
    for (const p of page.data.products.nodes) {
      products.push({
        id: p.id,
        title: p.title,
        description: p.description,
        vendor: p.vendor,
        hasImage: p.featuredMedia !== null,
        tracksInventory: p.tracksInventory,
        totalInventory: p.totalInventory,
        variants: p.variants.nodes.map((v) => ({
          price: Number(v.price),
          compareAtPrice: v.compareAtPrice === null ? null : Number(v.compareAtPrice),
          inventoryPolicy: v.inventoryPolicy,
          barcodes: v.barcodes.nodes.map((b) => b.value),
        })),
      });
    }
    const info = page.data.products.pageInfo;
    if (!info.hasNextPage || !info.endCursor) break;
    after = info.endCursor;
  }

  const zones = shipping?.shop.countriesInShippingZones;
  return {
    name: shop.name,
    contactEmail: shop.contactEmail ?? "",
    myshopifyDomain: shop.myshopifyDomain,
    primaryDomain: shop.primaryDomain,
    address: {
      company: shop.shopAddress.company ?? "",
      address1: shop.shopAddress.address1 ?? "",
      city: shop.shopAddress.city ?? "",
      zip: shop.shopAddress.zip ?? "",
      countryCode: shop.shopAddress.countryCodeV2 ?? "",
      phone: shop.shopAddress.phone ?? "",
      formatted: shop.shopAddress.formatted,
    },
    passwordEnabled: password ? password.onlineStore.passwordProtection.enabled : null,
    policies: shop.shopPolicies.filter((p) => p.body?.trim()),
    pages: pages ? pages.pages.nodes : null,
    products: products.slice(0, PRODUCT_LIMIT),
    productsTotal: main.data.productsCount?.count ?? products.length,
    shipping: zones ? { countryCodes: zones.countryCodes, restOfWorld: zones.includeRestOfWorld } : null,
    profileAddress: options.profileAddress,
  };
}
