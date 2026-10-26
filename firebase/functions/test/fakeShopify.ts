/**
 * Faux Shopify pour les tests : répond aux requêtes de l'audit selon leur nom
 * d'opération. Utilisé directement (tests unitaires) et derrière un serveur
 * HTTP local (tests de bout en bout avec les émulateurs).
 */
import type { Gql, GqlResult } from "../src/highTicket/collect";

export interface FakeOptions {
  products: number;
  /** Opérations refusées (accès manquant). */
  deny?: string[];
}

const PAGE = 20;

export function fakeResponse(query: string, variables: Record<string, unknown> | undefined, opts: FakeOptions): GqlResult<unknown> {
  const op = query.match(/query (\w+)/)?.[1] ?? "";
  if (opts.deny?.includes(op)) return { errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] };
  switch (op) {
    case "HtpAuditShop":
      return {
        data: {
          shop: {
            name: "Boutique Test",
            contactEmail: "contact@boutique-test.fr",
            myshopifyDomain: "boutique-test.myshopify.com",
            primaryDomain: { host: "boutique-test.myshopify.com", url: "https://boutique-test.myshopify.com", sslEnabled: true },
            shopAddress: {
              company: "Boutique Test SAS",
              address1: "1 rue du Test",
              city: "Paris",
              zip: "75001",
              countryCodeV2: "FR",
              phone: null,
              formatted: ["Boutique Test SAS", "1 rue du Test", "75001 Paris", "France"],
            },
            shopPolicies: [
              { type: "REFUND_POLICY", body: "<p>Retours acceptés sous 14 jours.</p>", url: "https://boutique-test.fr/policies/refund-policy" },
              { type: "PRIVACY_POLICY", body: "", url: "https://boutique-test.fr/policies/privacy-policy" },
            ],
          },
          productsCount: { count: opts.products },
        },
      };
    case "HtpAuditPassword":
      return { data: { onlineStore: { passwordProtection: { enabled: false } } } };
    case "HtpAuditPages":
      return { data: { pages: { nodes: [] } } };
    case "HtpAuditShipping":
      return { data: { shop: { countriesInShippingZones: { countryCodes: ["FR", "BE"], includeRestOfWorld: false } } } };
    case "HtpAuditProducts": {
      const start = variables?.after ? Number(variables.after) : 0;
      const end = Math.min(start + PAGE, opts.products);
      const nodes = [];
      for (let i = start; i < end; i++) {
        nodes.push({
          id: `gid://shopify/Product/${i + 1}`,
          title: i === 0 ? "Lampe en laiton PROMO" : `Lampe en laiton ${i + 1}`,
          description: "Lampe de bureau en laiton massif, abat-jour en lin, hauteur 45 cm. Ampoule E27 non fournie. Câble textile de 2 mètres.",
          vendor: "Boutique Test",
          tracksInventory: true,
          totalInventory: 3,
          featuredMedia: i === 1 ? null : { id: `gid://shopify/MediaImage/${i}` },
          variants: { nodes: [{ price: "120.00", compareAtPrice: "150.00", inventoryPolicy: "DENY", barcodes: { nodes: [{ value: "4006381333931" }] } }] },
        });
      }
      return { data: { products: { pageInfo: { hasNextPage: end < opts.products, endCursor: end < opts.products ? String(end) : null }, nodes } } };
    }
    default:
      return { errors: [{ message: `Opération inconnue : ${op}` }] };
  }
}

export function fakeShopify(opts: FakeOptions) {
  const calls: string[] = [];
  const gql: Gql = async <T,>(query: string, variables?: Record<string, unknown>) => {
    calls.push(query.match(/query (\w+)/)?.[1] ?? "");
    return fakeResponse(query, variables, opts) as GqlResult<T>;
  };
  return { gql, calls };
}
