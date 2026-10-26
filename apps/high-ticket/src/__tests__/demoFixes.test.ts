import { describe, expect, it } from "vitest";
import { FIX_FOR_RULE, SAMPLE_SNAPSHOT, runAudit } from "../lib/audit";
import { demoFixes } from "../lib/demoFixes";

describe("corrections du rapport d'exemple", () => {
  const report = runAudit(SAMPLE_SNAPSHOT);

  it("propose un titre sans mention promotionnelle pour le produit signalé", async () => {
    const finding = report.results.find((r) => r.id === "products_title_promo")!;
    expect(FIX_FOR_RULE[finding.id]).toBe("product_title");
    const ids = finding.items!.map((i) => i.id!);
    const [change] = await demoFixes.preview("product_title", ids);
    expect(change.before).toContain("PROMO");
    expect(change.after).toBe("Fauteuil scandinave");
  });

  it("n'applique jamais rien", async () => {
    expect(demoFixes.demo).toBe(true);
    expect(await demoFixes.apply([])).toEqual([]);
  });
});
