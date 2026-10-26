import { describe, expect, it } from "vitest";
import { generateLegalDocs, legalDocsToHtml } from "../lib/legal";
import { policies, profile } from "./fixtures";

describe("generateLegalDocs", () => {
  const docs = generateLegalDocs(profile, policies);

  it("produit une page par politique Shopify", () => {
    expect(docs.map((d) => d.policyType)).toEqual([
      "LEGAL_NOTICE",
      "TERMS_OF_SERVICE",
      "REFUND_POLICY",
      "SHIPPING_POLICY",
      "PRIVACY_POLICY",
      "CONTACT_INFORMATION",
    ]);
  });

  it("n'a plus de champ à compléter quand le profil est complet", () => {
    for (const d of docs) expect(d.body, d.title).not.toMatch(/\[[^\]]+\]/);
  });

  it("reprend les informations du profil et des conditions", () => {
    const all = docs.map((d) => d.body).join("\n");
    expect(all).toContain(profile.companyName);
    expect(all).toContain(policies.mediator);
    expect(all).toContain(`${policies.returnDays} jours`);
  });

  it("signale les champs manquants entre crochets", () => {
    const empty = generateLegalDocs({ ...profile, companyName: "" }, policies);
    expect(empty[0].body).toContain("[Raison sociale]");
  });

  it("n'évoque pas le droit de rétractation de l'UE pour la Suisse", () => {
    const ch = generateLegalDocs({ ...profile, country: "CH" }, policies);
    expect(ch.find((d) => d.id === "terms")!.body).not.toContain("14 jours");
  });

  it("échappe le HTML lors de l'export", () => {
    const html = legalDocsToHtml(generateLegalDocs({ ...profile, companyName: "<script>x</script>" }, policies), "A & B");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("A &amp; B");
  });
});
