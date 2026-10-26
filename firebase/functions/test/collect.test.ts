import { describe, expect, it } from "vitest";
import { collectSnapshot, type Gql, type GqlResult } from "../src/highTicket/collect";
import { fakeShopify } from "./fakeShopify";

const noWait = async () => undefined;

describe("lecture de la boutique", () => {
  it("normalise la boutique et parcourt toutes les pages de produits", async () => {
    const shop = fakeShopify({ products: 45 });
    const s = await collectSnapshot(shop.gql, { wait: noWait, profileAddress: "1 rue X" });
    expect(s.name).toBe("Boutique Test");
    expect(s.products).toHaveLength(45);
    expect(s.productsTotal).toBe(45);
    expect(s.products[0].variants[0]).toEqual({ price: 120, compareAtPrice: 150, inventoryPolicy: "DENY", barcodes: ["4006381333931"] });
    expect(s.passwordEnabled).toBe(false);
    expect(s.shipping).toEqual({ countryCodes: ["FR", "BE"], restOfWorld: false });
    expect(s.profileAddress).toBe("1 rue X");
    expect(shop.calls.filter((q) => q === "HtpAuditProducts")).toHaveLength(3);
  });

  it("s'arrête à 250 produits", async () => {
    const shop = fakeShopify({ products: 400 });
    const s = await collectSnapshot(shop.gql, { wait: noWait });
    expect(s.products).toHaveLength(250);
    expect(s.productsTotal).toBe(400);
  });

  it("continue sans les informations facultatives refusées par Shopify", async () => {
    const shop = fakeShopify({ products: 1, deny: ["HtpAuditPassword", "HtpAuditPages", "HtpAuditShipping"] });
    const s = await collectSnapshot(shop.gql, { wait: noWait });
    expect(s.passwordEnabled).toBeNull();
    expect(s.pages).toBeNull();
    expect(s.shipping).toBeNull();
  });

  it("réessaie quand Shopify limite le débit", async () => {
    const shop = fakeShopify({ products: 1 });
    let throttled = 2;
    const gql: Gql = async <T,>(query: string, variables?: Record<string, unknown>) => {
      if (query.includes("HtpAuditShop") && throttled-- > 0) {
        return { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] } as GqlResult<T>;
      }
      return shop.gql<T>(query, variables);
    };
    const s = await collectSnapshot(gql, { wait: noWait });
    expect(s.name).toBe("Boutique Test");
  });

  it("échoue clairement si la boutique est illisible", async () => {
    const shop = fakeShopify({ products: 1, deny: ["HtpAuditShop"] });
    await expect(collectSnapshot(shop.gql, { wait: noWait })).rejects.toThrow(/Lecture de la boutique impossible/);
  });
});
