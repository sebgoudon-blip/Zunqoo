import { describe, expect, it } from "vitest";
import { contactPageHtml, fixTestContent, fixTitle } from "../src/highTicket/audit";

describe("correction des titres", () => {
  it("retire les mentions promotionnelles et les séparateurs orphelins", () => {
    expect(fixTitle("Fauteuil scandinave PROMO -40% livraison offerte")).toBe("Fauteuil scandinave");
    expect(fixTitle("Lampe en laiton – Soldes !!")).toBe("Lampe en laiton");
  });

  it("calme les mots criés à partir de deux", () => {
    expect(fixTitle("BUREAU ÉLECTRIQUE en chêne")).toBe("Bureau Électrique en chêne");
    expect(fixTitle("Bureau HAY en chêne")).toBeNull();
  });

  it("coupe à 150 caractères sur un mot entier", () => {
    const fixed = fixTitle(`Bureau ${"chêne ".repeat(40)}`.trim())!;
    expect(fixed.length).toBeLessThanOrEqual(150);
    expect(fixed.endsWith("chêne")).toBe(true);
  });

  it("ne propose rien pour un titre propre ou qui deviendrait vide", () => {
    expect(fixTitle("Bureau assis-debout en chêne")).toBeNull();
    expect(fixTitle("PROMO -50%")).toBeNull();
  });
});

describe("retrait du texte provisoire", () => {
  it("retire « Produit de test — contenu provisoire. » en gardant le reste", () => {
    expect(fixTestContent("<p>Produit de test — contenu provisoire.Deux moules en silicone.</p>")).toBe("<p>Deux moules en silicone.</p>");
    expect(fixTestContent("<p>Lorem ipsum dolor sit amet.</p><p>Lampe en laiton.</p>")).toBe("<p>Lampe en laiton.</p>");
  });

  it("ne propose rien si la description deviendrait vide ou n'a rien à retirer", () => {
    expect(fixTestContent("<p>Produit de test.</p>")).toBeNull();
    expect(fixTestContent("<p>Lampe en laiton.</p>")).toBeNull();
  });
});

describe("page Contact", () => {
  it("n'utilise que les réglages de la boutique, échappés", () => {
    const html = contactPageHtml({
      name: "Atelier <Clair>",
      company: "Atelier Clair SARL",
      addressLines: ["3 place du Marché", "44000 Nantes"],
      email: "contact@atelier-clair.fr",
      phone: "+33 2 40 00 00 00",
    });
    expect(html).toContain("Atelier &lt;Clair&gt;");
    expect(html).toContain('href="mailto:contact@atelier-clair.fr"');
    expect(html).toContain("Atelier Clair SARL, 3 place du Marché, 44000 Nantes");
  });

  it("omet les informations absentes", () => {
    const html = contactPageHtml({ name: "X", company: "", addressLines: [], email: "a@b.fr", phone: "" });
    expect(html).not.toContain("Téléphone");
    expect(html).not.toContain("Adresse");
  });
});
