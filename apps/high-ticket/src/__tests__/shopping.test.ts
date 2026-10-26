import { describe, expect, it } from "vitest";
import { buildNegatives, buildTitle, checkTitle } from "../lib/shopping";

const parts = { brand: "Ma Marque", productType: "Bureau assis-debout électrique", attribute1: "Double moteur", attribute2: "160 x 80 cm", variant: "Chêne" };

describe("titres Shopping", () => {
  it("assemble marque, type, attributs et variante", () => {
    expect(buildTitle(parts)).toBe("Ma Marque Bureau assis-debout électrique Double moteur 160 x 80 cm – Chêne");
  });

  it("valide un titre propre", () => {
    expect(checkTitle(buildTitle(parts), parts).every((c) => c.ok)).toBe(true);
  });

  it("détecte promotions, majuscules et ponctuation", () => {
    const bad = { ...parts, attribute1: "PROMO -20 % !!" };
    const failed = checkTitle(buildTitle(bad), bad).filter((c) => !c.ok);
    expect(failed.length).toBeGreaterThanOrEqual(3);
  });

  it("détecte un titre trop long", () => {
    const long = { ...parts, variant: "x".repeat(200) };
    expect(checkTitle(buildTitle(long), long)[0].ok).toBe(false);
  });
});

describe("mots-clés négatifs", () => {
  it("combine les familles choisies, sans doublons", () => {
    const list = buildNegatives(["free", "used"], "MarqueX, marquex", "occasion\nnotice");
    expect(list).toContain("gratuit");
    expect(list).toContain("leboncoin");
    expect(list).toContain("marquex");
    expect(list).toContain("notice");
    expect(new Set(list).size).toBe(list.length);
  });
});
