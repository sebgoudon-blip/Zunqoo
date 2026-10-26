import { describe, expect, it } from "vitest";
import { BLOCKING_CAP, RULES, SAMPLE_SNAPSHOT, htmlToText, prioritized, runAudit, validGtin } from "../src/highTicket/audit";
import type { AuditReport, ShopSnapshot, SnapshotProduct } from "../src/highTicket/audit";

const goodProduct = (id: number, overrides: Partial<SnapshotProduct> = {}): SnapshotProduct => ({
  id: `gid://shopify/Product/${id}`,
  title: `Bureau assis-debout en chêne ${id}`,
  description:
    "Bureau électrique à double moteur, plateau en chêne massif de 160 x 80 cm. Hauteur réglable de 65 à 130 cm, trois mémoires de position. Livré avec notice de montage.",
  vendor: "Atelier Clair",
  hasImage: true,
  tracksInventory: true,
  totalInventory: 5,
  variants: [{ price: 990, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: ["4006381333931"] }],
  ...overrides,
});

const long = (s: string) => `${s} ${"Texte détaillé de la politique, avec procédure, exceptions et contact. ".repeat(8)}`;

/** Boutique conforme à tous les contrôles automatiques. */
function cleanShop(): ShopSnapshot {
  return {
    name: "Atelier Clair",
    contactEmail: "contact@atelier-clair.fr",
    myshopifyDomain: "atelier-clair.myshopify.com",
    primaryDomain: { host: "atelier-clair.fr", url: "https://atelier-clair.fr", sslEnabled: true },
    address: {
      company: "Atelier Clair SARL",
      address1: "3 place du Marché",
      city: "Nantes",
      zip: "44000",
      countryCode: "FR",
      phone: "+33 2 40 00 00 00",
      formatted: ["Atelier Clair SARL", "3 place du Marché", "44000 Nantes", "France"],
    },
    passwordEnabled: false,
    policies: [
      { type: "REFUND_POLICY", body: `<p>${long("Vous disposez de 14 jours pour retourner un produit.")}</p>`, url: "u1" },
      { type: "SHIPPING_POLICY", body: `<p>${long("Expédition sous 2 jours ouvrés, livraison en 3 à 5 jours.")}</p>`, url: "u2" },
      { type: "TERMS_OF_SERVICE", body: `<p>${long("Droit de rétractation : 14 jours à compter de la réception.")}</p>`, url: "u3" },
      { type: "PRIVACY_POLICY", body: `<p>${long("Données traitées pour l'exécution des commandes.")}</p>`, url: "u4" },
      {
        type: "LEGAL_NOTICE",
        body: `<p>${long("Atelier Clair SARL, 3 place du Marché, 44000 Nantes. contact@atelier-clair.fr – 02 40 00 00 00.")}</p>`,
        url: "u5",
      },
      { type: "CONTACT_INFORMATION", body: "<p>contact@atelier-clair.fr<br>02 40 00 00 00<br>44000 Nantes</p>", url: "u6" },
    ],
    pages: [],
    products: [1, 2, 3, 4, 5].map((i) => goodProduct(i)),
    productsTotal: 5,
    shipping: { countryCodes: ["FR", "BE"], restOfWorld: false },
  };
}

const result = (report: AuditReport, id: string) => report.results.find((r) => r.id === id);
const statusOf = (s: ShopSnapshot, id: string) => result(runAudit(s), id)?.status;

describe("audit d'une boutique conforme", () => {
  const report = runAudit(cleanShop(), 0);

  it("obtient 100 et aucun point à corriger", () => {
    expect(prioritized(report)).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.counts).toEqual({ bloquant: 0, important: 0, conseil: 0 });
  });

  it("signale les paiements comme à vérifier à la main, sans pénalité", () => {
    expect(result(report, "checkout_payments")?.status).toBe("manual");
    expect(report.manual).toBe(1);
  });

  it("chaque règle a un pourquoi, des étapes de correction et une source", () => {
    for (const r of RULES) {
      expect(r.why.length, r.id).toBeGreaterThan(30);
      expect(r.fix.length, r.id).toBeGreaterThan(0);
      expect(r.source, r.id).toMatch(/^https:\/\/support\.google\.com\/merchants\//);
    }
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
});

describe("identité", () => {
  it("email, adresse et téléphone manquants", () => {
    const s = cleanShop();
    s.contactEmail = "";
    s.address.zip = "";
    s.address.phone = "";
    expect(statusOf(s, "identity_email")).toBe("fail");
    expect(statusOf(s, "identity_address")).toBe("fail");
    expect(statusOf(s, "identity_phone")).toBe("fail");
  });

  it("aucune page de coordonnées", () => {
    const s = cleanShop();
    s.policies = s.policies.filter((p) => p.type !== "CONTACT_INFORMATION" && p.type !== "LEGAL_NOTICE");
    expect(statusOf(s, "identity_contact_page")).toBe("fail");
    s.pages = [{ title: "Nous contacter", handle: "contact", body: "<p>contact@atelier-clair.fr</p>", isPublished: true }];
    expect(statusOf(s, "identity_contact_page")).toBe("pass");
  });

  it("coordonnées différentes entre Shopify et les pages", () => {
    const s = cleanShop();
    s.policies = s.policies.map((p) =>
      p.type === "CONTACT_INFORMATION" ? { ...p, body: "<p>autre@gmail.com – 06 11 22 33 44 – 75001 Paris</p>" } : p
    );
    s.policies = s.policies.filter((p) => p.type !== "LEGAL_NOTICE");
    const r = result(runAudit(s), "identity_consistency");
    expect(r?.status).toBe("fail");
    expect(r?.items?.map((i) => i.label)).toEqual(["Email", "Téléphone", "Adresse"]);
  });

  it("accepte un téléphone écrit dans un autre format", () => {
    const s = cleanShop();
    s.address.phone = "+33240000000";
    expect(statusOf(s, "identity_consistency")).toBe("pass");
  });

  it("compare l'adresse du profil seulement si elle est renseignée", () => {
    const s = cleanShop();
    expect(statusOf(s, "identity_profile_address")).toBeUndefined();
    s.profileAddress = "10 rue de Rivoli, 75001 Paris";
    expect(statusOf(s, "identity_profile_address")).toBe("fail");
    s.profileAddress = "3 place du Marché 44000 Nantes";
    expect(statusOf(s, "identity_profile_address")).toBe("pass");
  });
});

describe("domaine", () => {
  it("myshopify, sans HTTPS, mot de passe", () => {
    const s = cleanShop();
    s.primaryDomain = { host: "atelier-clair.myshopify.com", url: "http://atelier-clair.myshopify.com", sslEnabled: false };
    s.passwordEnabled = true;
    expect(statusOf(s, "domain_custom")).toBe("fail");
    expect(statusOf(s, "domain_https")).toBe("fail");
    expect(statusOf(s, "domain_password")).toBe("fail");
  });

  it("mot de passe non lisible : à vérifier", () => {
    const s = cleanShop();
    s.passwordEnabled = null;
    expect(statusOf(s, "domain_password")).toBe("manual");
  });
});

describe("politiques", () => {
  it("politiques absentes ou vides", () => {
    const s = cleanShop();
    s.policies = s.policies.filter((p) => p.type !== "REFUND_POLICY").map((p) => (p.type === "SHIPPING_POLICY" ? { ...p, body: "<p> </p>" } : p));
    expect(statusOf(s, "policy_refund_policy")).toBe("fail");
    expect(statusOf(s, "policy_shipping_policy")).toBe("fail");
    expect(statusOf(s, "policy_terms_of_service")).toBe("pass");
  });

  it("champs de modèle non remplis", () => {
    const s = cleanShop();
    s.policies[2] = { ...s.policies[2], body: `<p>${long("[Nom de l'entreprise], au capital de XXX €.")}</p>` };
    const r = result(runAudit(s), "policy_placeholders");
    expect(r?.status).toBe("fail");
    expect(r?.items?.[0].label).toBe("Conditions générales de vente");
  });

  it("politique trop courte", () => {
    const s = cleanShop();
    s.policies[3] = { ...s.policies[3], body: "<p>Nous respectons votre vie privée.</p>" };
    expect(statusOf(s, "policy_length")).toBe("fail");
  });

  it("délais absents de la politique de retour et de livraison", () => {
    const s = cleanShop();
    s.policies[0] = { ...s.policies[0], body: `<p>${long("Les retours sont acceptés.")}</p>` };
    s.policies[1] = { ...s.policies[1], body: `<p>${long("Nous expédions rapidement.")}</p>` };
    expect(statusOf(s, "policy_refund_content")).toBe("fail");
    expect(statusOf(s, "policy_shipping_content")).toBe("fail");
  });

  it("délais de retour incohérents entre CGV et politique de retour", () => {
    const s = cleanShop();
    s.policies[0] = { ...s.policies[0], body: `<p>${long("Retour possible sous 30 jours.")}</p>` };
    const r = result(runAudit(s), "policy_delays_consistency");
    expect(r?.status).toBe("fail");
    expect(r?.detail).toContain("30");
  });
});

describe("politiques publiées comme pages", () => {
  it("reconnaît les CGV, retours et livraison publiés comme pages", () => {
    const s = cleanShop();
    const moved = s.policies.filter((p) => p.type !== "PRIVACY_POLICY" && p.type !== "CONTACT_INFORMATION" && p.type !== "LEGAL_NOTICE");
    s.policies = s.policies.filter((p) => !moved.includes(p));
    s.pages = [
      { title: "Retours et rétractation", handle: "retours-retractation", body: moved[0].body, isPublished: true },
      { title: "Politique de livraison", handle: "politique-livraison", body: moved[1].body, isPublished: true },
      { title: "Conditions générales de vente", handle: "cgv", body: moved[2].body, isPublished: true },
    ];
    const report = runAudit(s);
    expect(result(report, "policy_refund_policy")?.detail).toContain("/pages/retours-retractation");
    expect(prioritized(report)).toEqual([]);
  });

  it("ignore les pages non publiées ou vides", () => {
    const s = cleanShop();
    s.policies = s.policies.filter((p) => p.type !== "SHIPPING_POLICY");
    s.pages = [
      { title: "Livraison", handle: "livraison", body: "<p>Expédition sous 2 jours.</p>", isPublished: false },
      { title: "Politique de livraison", handle: "politique-livraison", body: "", isPublished: true },
    ];
    expect(statusOf(s, "policy_shipping_policy")).toBe("fail");
  });

  it("repère les champs à compléter dans une page", () => {
    const s = cleanShop();
    s.policies = s.policies.filter((p) => p.type !== "LEGAL_NOTICE");
    s.pages = [
      {
        title: "Mentions légales",
        handle: "mentions-legales",
        body: `<p>${long("Médiateur : [À COMPLÉTER : nom, adresse postale et site internet du médiateur auquel la société adhère].")}</p>`,
        isPublished: true,
      },
    ];
    const r = result(runAudit(s), "policy_placeholders");
    expect(r?.status).toBe("fail");
    expect(r?.items?.[0].label).toBe("Mentions légales (page « Mentions légales »)");
  });
});

describe("produits", () => {
  const withProduct = (p: Partial<SnapshotProduct>) => {
    const s = cleanShop();
    s.products[0] = goodProduct(1, p);
    return s;
  };

  it("aucun produit actif", () => {
    const s = cleanShop();
    s.products = [];
    s.productsTotal = 0;
    expect(statusOf(s, "products_present")).toBe("fail");
  });

  it("image, description, prix à 0", () => {
    expect(statusOf(withProduct({ hasImage: false }), "products_image")).toBe("fail");
    expect(statusOf(withProduct({ description: " " }), "products_description")).toBe("fail");
    expect(statusOf(withProduct({ description: "Bureau en bois." }), "products_description_short")).toBe("fail");
    const zero = withProduct({ variants: [{ price: 0, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: [] }] });
    expect(statusOf(zero, "products_price_zero")).toBe("fail");
  });

  it("texte provisoire dans un produit", () => {
    const r = result(runAudit(withProduct({ description: "Produit de test — contenu provisoire. Bureau en chêne." })), "products_test_content");
    expect(r?.status).toBe("fail");
    expect(statusOf(cleanShop(), "products_test_content")).toBe("pass");
  });

  it("liste les produits concernés avec un lien vers l'admin Shopify", () => {
    const r = result(runAudit(withProduct({ hasImage: false })), "products_image");
    expect(r?.count).toBe(1);
    expect(r?.items?.[0].url).toBe("https://admin.shopify.com/store/atelier-clair/products/1");
  });

  it("rupture de stock sans vente en précommande", () => {
    expect(statusOf(withProduct({ totalInventory: 0 }), "products_stock")).toBe("fail");
    const backorder = withProduct({ totalInventory: 0, variants: [{ price: 990, compareAtPrice: null, inventoryPolicy: "CONTINUE", barcodes: [] }] });
    expect(statusOf(backorder, "products_stock")).toBe("pass");
  });

  it("GTIN absent ou invalide", () => {
    const none = withProduct({ variants: [{ price: 990, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: [] }] });
    expect(statusOf(none, "products_gtin_missing")).toBe("fail");
    expect(statusOf(none, "products_gtin_invalid")).toBe("pass");
    const bad = withProduct({ variants: [{ price: 990, compareAtPrice: null, inventoryPolicy: "DENY", barcodes: ["SKU-123"] }] });
    expect(statusOf(bad, "products_gtin_invalid")).toBe("fail");
  });

  it("prix barré suspect et promotion permanente", () => {
    const s = cleanShop();
    s.products = s.products.map((p) => ({ ...p, variants: [{ ...p.variants[0], compareAtPrice: 1100 }] }));
    expect(statusOf(s, "products_permanent_sale")).toBe("fail");
    expect(statusOf(s, "products_compare_at")).toBe("pass");
    s.products[0].variants[0].compareAtPrice = 2500;
    const r = result(runAudit(s), "products_compare_at");
    expect(r?.status).toBe("fail");
    expect(r?.items?.[0].detail).toContain("-60 %");
  });

  it("titres : promotion, longueur, majuscules", () => {
    expect(statusOf(withProduct({ title: "Bureau en chêne -20% livraison offerte" }), "products_title_promo")).toBe("fail");
    expect(statusOf(withProduct({ title: "x".repeat(151) }), "products_title_length")).toBe("fail");
    expect(statusOf(withProduct({ title: "BUREAU ÉLECTRIQUE en chêne" }), "products_title_caps")).toBe("fail");
    expect(statusOf(withProduct({ title: "Bureau HAY en chêne" }), "products_title_caps")).toBe("pass");
  });

  it("santé, imitation, marques tierces", () => {
    expect(statusOf(withProduct({ title: "Coussin chauffant qui soigne le dos" }), "products_title_health")).toBe("fail");
    expect(statusOf(withProduct({ title: "Sac réplique cuir" }), "products_title_imitation")).toBe("fail");
    expect(statusOf(withProduct({ title: "Coque pour iPhone, compatible Apple" }), "products_title_brands")).toBe("fail");
    expect(statusOf(withProduct({ title: "Casque Dyson Zone", vendor: "Dyson" }), "products_title_brands")).toBe("pass");
  });
});

describe("tunnel", () => {
  it("zones de livraison", () => {
    const s = cleanShop();
    s.shipping = { countryCodes: [], restOfWorld: false };
    expect(statusOf(s, "checkout_shipping_zones")).toBe("fail");
    s.shipping = { countryCodes: ["BE"], restOfWorld: false };
    expect(statusOf(s, "checkout_shipping_zones")).toBe("fail");
    s.shipping = null;
    expect(statusOf(s, "checkout_shipping_zones")).toBe("manual");
  });
});

describe("score", () => {
  it("un point bloquant plafonne le score", () => {
    const s = cleanShop();
    s.passwordEnabled = true;
    const report = runAudit(s);
    expect(report.counts.bloquant).toBe(1);
    expect(report.score).toBe(BLOCKING_CAP);
  });

  it("retire 6 points par point important et 2 par conseil", () => {
    const s = cleanShop();
    s.primaryDomain.host = "atelier-clair.myshopify.com";
    s.address.phone = "";
    expect(runAudit(s).score).toBe(100 - 6 - 2);
  });

  it("classe les points du plus grave au moins grave", () => {
    const report = runAudit(SAMPLE_SNAPSHOT);
    const order = prioritized(report).map((r) => r.severity);
    expect(order).toEqual([...order].sort((a, b) => ["bloquant", "important", "conseil"].indexOf(a) - ["bloquant", "important", "conseil"].indexOf(b)));
    expect(report.counts.bloquant).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(BLOCKING_CAP);
  });
});

describe("outils de texte", () => {
  it("convertit le HTML en texte", () => {
    expect(htmlToText("<h2>Titre</h2><p>Prix&nbsp;: 10&euro; &amp; plus<br>ligne</p><script>x()</script>")).toBe("Titre\nPrix : 10€ & plus\nligne");
  });

  it("valide les GTIN", () => {
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
    expect(validGtin("036000291452")).toBe(true);
    expect(validGtin("12345")).toBe(false);
  });
});
