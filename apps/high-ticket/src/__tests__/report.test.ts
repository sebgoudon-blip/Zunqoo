import { describe, expect, it } from "vitest";
import { SAMPLE_SNAPSHOT, runAudit } from "../lib/audit";
import { failedBySeverity, reportToHtml, scoreLabel } from "../lib/report";

describe("rapport d'audit", () => {
  const report = runAudit(SAMPLE_SNAPSHOT, Date.UTC(2026, 9, 26));

  it("classe les points du plus grave au moins grave", () => {
    const severities = failedBySeverity(report).map((r) => r.severity);
    expect(severities[0]).toBe("bloquant");
    expect(severities[severities.length - 1]).toBe("conseil");
  });

  it("annonce un risque élevé tant qu'il reste un point bloquant", () => {
    expect(scoreLabel(report)).toBe("Risque élevé");
  });

  it("exporte un HTML autonome avec score, corrections et avertissement", () => {
    const html = reportToHtml(report);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain(`${report.score}/100`);
    expect(html).toContain("Comment corriger");
    expect(html).toContain("Google seul décide");
    expect(html).toContain("https://admin.shopify.com/store/maison-exemple/products/3");
  });

  it("échappe le contenu venant de la boutique", () => {
    const html = reportToHtml({ ...report, shop: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("n'insère pas de lien non https", () => {
    const evil = { ...report, results: report.results.map((r) => ({ ...r, source: "javascript:alert(1)" })) };
    expect(reportToHtml(evil)).not.toContain("javascript:");
  });
});
