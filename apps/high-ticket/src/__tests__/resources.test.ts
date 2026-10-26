import { describe, expect, it } from "vitest";
import { RESOURCES, fillPlaceholders, resourceText } from "../content/resources";

describe("ressources des tâches", () => {
  it("remplit les marqueurs connus et laisse les autres", () => {
    const out = fillPlaceholders("[Ton prénom et nom] – [Ta société] – [produit]", { firstName: "Camille", companyName: "", storeName: "Ma Marque" });
    expect(out).toBe("Camille – Ma Marque – [produit]");
  });

  it("ne remplace rien sans profil", () => {
    expect(fillPlaceholders("[Ton email]", null)).toBe("[Ton email]");
  });

  it("exporte un tableau au format tabulé", () => {
    const table = RESOURCES["2.2"].find((r) => r.kind === "table")!;
    const lines = resourceText(table).split("\n");
    expect(lines[0].split("\t")).toHaveLength(4);
    expect(lines.length).toBeGreaterThan(5);
  });

  it("a des lignes de tableau complètes", () => {
    for (const list of Object.values(RESOURCES)) {
      for (const r of list) {
        if (r.kind === "table") for (const row of r.rows) expect(row).toHaveLength(r.columns.length);
      }
    }
  });
});
