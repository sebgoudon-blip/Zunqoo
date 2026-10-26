import { describe, expect, it } from "vitest";
import { computeAds, computeProfit } from "../lib/calc";

describe("computeProfit", () => {
  const base = {
    priceTtc: 749,
    vatRate: 20,
    productCost: 280,
    shippingCost: 35,
    paymentPercent: 1.9,
    paymentFixed: 0.25,
    returnsPercent: 5,
  };

  it("calcule la marge avant publicité à partir du prix TTC", () => {
    const r = computeProfit(base);
    expect(r.priceHt).toBeCloseTo(624.17, 2);
    expect(r.paymentFees).toBeCloseTo(14.48, 2);
    expect(r.returnsReserve).toBeCloseTo(37.45, 2);
    expect(r.marginBeforeAds).toBeCloseTo(624.17 - 280 - 35 - 14.48 - 37.45, 1);
    expect(r.breakEvenRoas).toBeCloseTo(749 / r.marginBeforeAds, 5);
  });

  it("renvoie un ROAS infini quand la marge est négative", () => {
    const r = computeProfit({ ...base, productCost: 900 });
    expect(r.marginBeforeAds).toBeLessThan(0);
    expect(r.breakEvenRoas).toBe(Infinity);
  });

  it("gère la franchise de TVA", () => {
    expect(computeProfit({ ...base, vatRate: 0 }).priceHt).toBe(749);
  });
});

describe("computeAds", () => {
  it("projette clics, ventes, ROAS et règle de coupe", () => {
    const r = computeAds({ adBudget: 600, days: 30, cpc: 1, conversionRate: 1, priceTtc: 749, marginBeforeAds: 250 });
    expect(r.dailyBudget).toBe(20);
    expect(r.clicks).toBe(600);
    expect(r.sales).toBe(6);
    expect(r.roas).toBeCloseTo((6 * 749) / 600, 5);
    expect(r.profit).toBe(6 * 250 - 600);
    expect(r.killClicks).toBe(500);
  });

  it("ne divise pas par zéro", () => {
    const r = computeAds({ adBudget: 0, days: 0, cpc: 0, conversionRate: 0, priceTtc: 0, marginBeforeAds: 0 });
    expect(r.clicks).toBe(0);
    expect(r.dailyBudget).toBe(0);
    expect(r.cpa).toBe(Infinity);
  });
});
