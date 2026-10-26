import { describe, expect, it } from "vitest";
import { advise, summarize, type DayEntry } from "../lib/tracker";

const day = (date: string, spend: number, sales = 0, revenue = 0, clicks = 20): DayEntry => ({ date, spend, clicks, sales, revenue });

describe("suivi quotidien", () => {
  it("additionne les jours et calcule ROAS et CPA", () => {
    const s = summarize([day("2026-11-02", 30, 1, 749), day("2026-11-01", 20)]);
    expect(s.spend).toBe(50);
    expect(s.sales).toBe(1);
    expect(s.roas).toBeCloseTo(749 / 50, 5);
    expect(s.cpa).toBe(50);
  });

  it("compte la dépense depuis la dernière vente, dans l'ordre des dates", () => {
    const s = summarize([day("2026-11-03", 40), day("2026-11-01", 25), day("2026-11-02", 30, 1, 749)]);
    expect(s.spendSinceLastSale).toBe(40);
  });

  it("déclenche la règle de coupe à 2 × le CPA max sans vente", () => {
    const s = summarize([day("2026-11-01", 200), day("2026-11-02", 200), day("2026-11-03", 120)]);
    expect(advise(s, 250, 3).tone).toBe("bad");
    expect(advise(s, 300, 3).tone).toBe("warn");
  });

  it("demande d'attendre 3 jours avant de décider", () => {
    expect(advise(summarize([day("2026-11-01", 20)]), 250, 3).message).toContain("3 jours");
  });

  it("valide une campagne rentable", () => {
    const s = summarize([day("2026-11-01", 50), day("2026-11-02", 50, 1, 749), day("2026-11-03", 50)]);
    expect(advise(s, 250, 3).tone).toBe("good");
  });
});
