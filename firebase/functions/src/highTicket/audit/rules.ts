import { digitsOf, emailsIn, htmlToText, mentionsDelay, normalize, phoneIn, placeholdersIn, returnDelays, validGtin } from "./text";
import type {
  AuditItem,
  AuditReport,
  AuditResult,
  Category,
  PolicyType,
  ResultStatus,
  Severity,
  ShopSnapshot,
  SnapshotProduct,
} from "./types";

/** Nombre maximal de produits analysés par audit (limite de temps et de quota Shopify). */
export const PRODUCT_LIMIT = 250;
/** Nombre maximal d'éléments listés par point (le total reste indiqué). */
export const ITEM_LIMIT = 20;

/** Points retirés au score de 100 pour chaque point à corriger. */
export const PENALTY: Record<Severity, number> = { bloquant: 15, important: 6, conseil: 2 };
/** Tant qu'il reste un point bloquant, le score ne dépasse pas cette valeur. */
export const BLOCKING_CAP = 59;

// Pages d'aide officielles. Les règles Google évoluent : la page de référence
// fait foi, et chaque règle ci-dessous doit être revérifiée régulièrement.
const SRC = {
  guidelines: "https://support.google.com/merchants/answer/6363310",
  misrepresentation: "https://support.google.com/merchants/answer/6150127",
  spec: "https://support.google.com/merchants/answer/7052112",
  salePrice: "https://support.google.com/merchants/answer/9017019",
  policies: "https://support.google.com/merchants/answer/6149970",
};

const POLICY_LABELS: Record<PolicyType, string> = {
  LEGAL_NOTICE: "Mentions légales",
  TERMS_OF_SERVICE: "Conditions générales de vente",
  REFUND_POLICY: "Politique de retour et de remboursement",
  SHIPPING_POLICY: "Politique d'expédition",
  PRIVACY_POLICY: "Politique de confidentialité",
  CONTACT_INFORMATION: "Coordonnées",
};

const PROMO =
  /\b(promo(tion)?s?|soldes?|offerte?s?|gratuite?s?|pas cher|meilleur prix|prix choc|d[ée]stockage|livraison (gratuite|offerte)|black friday|free shipping|best ?seller|n°\s?1)\b|-\s?\d+\s?%/i;
const HEALTH =
  /\b(gu[ée]ri[rt]?|gu[ée]rison|soigner?|anti[- ]?cancer|miracle|perte de poids (garantie|rapide)|maigri[rs] (vite|rapidement)|anti[- ]?covid|cures?|heals?)\b/i;
const TEST_CONTENT = /produit de test|contenu provisoire|lorem ipsum|test product|placeholder|texte (?:provisoire|temporaire)|description (?:a venir|à venir)/i;
const IMITATION = /\b(r[ée]pliques?|replicas?|contrefa[çc]ons?|copies? conformes?|dupes?|first copy|inspir[ée]e?s? (de|par)|1:1)\b/i;
// Marques très souvent contrefaites. Un revendeur autorisé peut les citer : le
// point est un conseil de vérification, pas une accusation.
const WATCHED_BRANDS = [
  "nike", "adidas", "apple", "samsung", "chanel", "dior", "gucci", "louis vuitton", "hermes", "rolex", "cartier",
  "prada", "versace", "balenciaga", "ray-ban", "dyson", "lego", "disney", "pokemon", "marvel", "moncler", "yeezy",
];

/** Où le texte d'une politique a été trouvé : politique Shopify ou page de la boutique. */
interface PolicyDoc {
  url: string;
  /** Titre de la page, si la politique vient d'une page. */
  page?: string;
}

interface Context {
  s: ShopSnapshot;
  policyText: Map<PolicyType, string>;
  policyDocs: Map<PolicyType, PolicyDoc>;
  /** Texte où un client cherche les coordonnées : politique Coordonnées, mentions légales, page Contact. */
  contactText: string;
  adminProductUrl: (id: string) => string;
}

interface Outcome {
  status: ResultStatus;
  detail: string;
  items?: AuditItem[];
  count?: number;
}

interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  why: string;
  fix: string[];
  source?: string;
  /** null : règle sans objet pour cette boutique (elle n'apparaît pas dans le rapport). */
  check: (ctx: Context) => Outcome | null;
}

const pass = (detail: string): Outcome => ({ status: "pass", detail });
const fail = (detail: string, items?: AuditItem[], count?: number): Outcome => ({ status: "fail", detail, items, count });
const manual = (detail: string): Outcome => ({ status: "manual", detail });

/** Règle appliquée produit par produit : échoue si au moins un produit est concerné. */
function productRule(
  ctx: Context,
  match: (p: SnapshotProduct) => string | false,
  okDetail: string,
  failDetail: (n: number) => string
): Outcome {
  const hits = ctx.s.products.map((p) => ({ p, why: match(p) })).filter((h) => h.why !== false);
  if (!hits.length) return pass(okDetail);
  const items = hits
    .slice(0, ITEM_LIMIT)
    .map(({ p, why }) => ({ label: p.title || "(sans titre)", detail: why || undefined, url: ctx.adminProductUrl(p.id) }));
  return fail(failDetail(hits.length), items, hits.length);
}

const docLabel = (type: PolicyType, docs: Map<PolicyType, PolicyDoc>) => {
  const page = docs.get(type)?.page;
  return page ? `${POLICY_LABELS[type]} (page « ${page} »)` : POLICY_LABELS[type];
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function policyPresence(type: PolicyType, severity: Severity, why: string, fix: string[]): Rule {
  return {
    id: `policy_${type.toLowerCase()}`,
    category: "politiques",
    severity,
    title: `${POLICY_LABELS[type]} publiée`,
    why,
    fix,
    source: SRC.guidelines,
    check: (ctx) => {
      const doc = ctx.policyDocs.get(type);
      if (!doc) return fail("Ni politique Shopify, ni page publiée de ce type n'a été trouvée.");
      return pass(doc.page ? `Page « ${doc.page} » : ${doc.url}` : doc.url);
    },
  };
}

const POLICY_FIX = (label: string) => [
  `Dans Shopify, ouvre Paramètres > Politiques et remplis « ${label} ».`,
  "Adapte le texte à ta boutique (délais, frais, coordonnées) : un modèle non personnalisé est un signal négatif.",
  "Vérifie que la page est accessible depuis le pied de page de ta boutique.",
];

export const RULES: Rule[] = [
  // ——— Identité et coordonnées ———
  {
    id: "identity_email",
    category: "identite",
    severity: "bloquant",
    title: "Email de contact renseigné",
    why: "Google exige qu'un client puisse te contacter. Sans email de contact, ta boutique paraît moins fiable et les messages des clients se perdent.",
    fix: ["Dans Shopify, ouvre Paramètres > Général.", "Renseigne l'email de contact de la boutique, sur ton propre domaine si possible."],
    source: SRC.guidelines,
    check: ({ s }) => (s.contactEmail.trim() ? pass(s.contactEmail) : fail("Aucun email de contact dans Shopify.")),
  },
  {
    id: "identity_phone",
    category: "identite",
    severity: "conseil",
    title: "Téléphone renseigné",
    why: "Google demande au moins un moyen de contact. Un numéro de téléphone, en plus de l'email, rassure les clients et les relecteurs de Google.",
    fix: ["Dans Shopify, ouvre Paramètres > Général > Adresse de la boutique.", "Ajoute un numéro joignable aux heures indiquées sur ta page Contact."],
    source: SRC.guidelines,
    check: ({ s }) => (s.address.phone.trim() ? pass(s.address.phone) : fail("Aucun numéro de téléphone dans l'adresse de la boutique.")),
  },
  {
    id: "identity_address",
    category: "identite",
    severity: "bloquant",
    title: "Adresse de l'entreprise complète",
    why: "Une adresse incomplète ou absente fait partie des signaux de « présentation trompeuse », un motif de suspension sans préavis.",
    fix: [
      "Dans Shopify, ouvre Paramètres > Général > Adresse de la boutique.",
      "Indique l'adresse exacte de ton entreprise, identique à celle de ton immatriculation et de Merchant Center.",
    ],
    source: SRC.misrepresentation,
    check: ({ s }) => {
      const missing = [!s.address.address1 && "rue", !s.address.zip && "code postal", !s.address.city && "ville"].filter(Boolean);
      return missing.length ? fail(`Il manque : ${missing.join(", ")}.`) : pass(s.address.formatted.join(", "));
    },
  },
  {
    id: "identity_contact_page",
    category: "identite",
    severity: "bloquant",
    title: "Coordonnées visibles sur la boutique",
    why: "Google vérifie que les clients trouvent au moins un moyen de te contacter sur le site lui-même (email, téléphone, formulaire).",
    fix: [
      "Remplis la politique « Coordonnées » dans Paramètres > Politiques, ou crée une page Contact dans Boutique en ligne > Pages.",
      "Indique au minimum : raison sociale, adresse, email, et téléphone si tu en as un.",
      "Ajoute le lien dans le menu ou le pied de page.",
    ],
    source: SRC.guidelines,
    check: (ctx) => {
      if (ctx.contactText.trim()) return pass("Coordonnées trouvées (politique Coordonnées, mentions légales ou page Contact).");
      if (ctx.s.pages === null) return manual("Pages non lisibles : vérifie qu'une page Contact est publiée.");
      return fail("Ni politique « Coordonnées », ni mentions légales, ni page Contact publiée.");
    },
  },
  {
    id: "identity_consistency",
    category: "identite",
    severity: "important",
    title: "Coordonnées identiques partout",
    why: "Des coordonnées différentes entre Shopify et les pages du site sont un signal classique de « présentation trompeuse ».",
    fix: [
      "Choisis une seule version de ton email, de ton téléphone et de ton adresse.",
      "Reporte-la à l'identique dans Paramètres > Général, dans les politiques et sur la page Contact.",
      "Fais de même dans Merchant Center (Paramètres > Informations sur l'entreprise).",
    ],
    source: SRC.misrepresentation,
    check: ({ s, contactText }) => {
      if (!contactText.trim()) return manual("Aucune page de coordonnées à comparer.");
      const items: AuditItem[] = [];
      const email = s.contactEmail.trim().toLowerCase();
      const shown = emailsIn(contactText);
      if (email && shown.length && !shown.includes(email)) {
        items.push({ label: "Email", detail: `Shopify : ${email} ; pages : ${shown.slice(0, 3).join(", ")}` });
      }
      if (s.address.phone && digitsOf(contactText).length >= 8 && !phoneIn(s.address.phone, contactText)) {
        items.push({ label: "Téléphone", detail: `Le numéro ${s.address.phone} n'apparaît pas sur les pages de coordonnées.` });
      }
      if (s.address.zip && !normalize(contactText).includes(normalize(s.address.zip))) {
        items.push({ label: "Adresse", detail: `Le code postal ${s.address.zip} n'apparaît pas sur les pages de coordonnées.` });
      }
      return items.length ? fail(`${plural(items.length, "différence")} entre Shopify et tes pages.`, items) : pass("Email, téléphone et adresse cohérents.");
    },
  },
  {
    id: "identity_profile_address",
    category: "identite",
    severity: "important",
    title: "Adresse identique à ton profil",
    why: "L'adresse de la boutique doit correspondre à celle de ton entreprise déclarée dans Merchant Center.",
    fix: ["Compare l'adresse de Paramètres > Général avec celle de ton immatriculation.", "Corrige celle qui est fausse, puis relance l'audit."],
    source: SRC.misrepresentation,
    check: ({ s }) => {
      if (!s.profileAddress?.trim() || !s.address.zip) return null;
      return normalize(s.profileAddress).includes(normalize(s.address.zip))
        ? pass("Même code postal que ton profil.")
        : fail(`Shopify indique ${s.address.formatted.join(", ")}.`);
    },
  },

  // ——— Domaine et accès ———
  {
    id: "domain_https",
    category: "domaine",
    severity: "bloquant",
    title: "HTTPS actif",
    why: "Google exige que le paiement et la collecte de données passent par une connexion sécurisée (https://).",
    fix: ["Dans Shopify, ouvre Paramètres > Domaines.", "Vérifie que le certificat SSL du domaine principal est actif. S'il est en attente, contrôle la configuration DNS du domaine."],
    source: SRC.guidelines,
    check: ({ s }) => (s.primaryDomain.sslEnabled ? pass(s.primaryDomain.url) : fail(`${s.primaryDomain.host} n'a pas de certificat SSL actif.`)),
  },
  {
    id: "domain_password",
    category: "domaine",
    severity: "bloquant",
    title: "Boutique ouverte au public",
    why: "Une boutique protégée par mot de passe ne peut pas être vérifiée par Google : les produits sont refusés.",
    fix: ["Dans Shopify, ouvre Boutique en ligne > Préférences.", "Désactive la protection par mot de passe (un forfait payant Shopify est nécessaire)."],
    source: SRC.guidelines,
    check: ({ s }) =>
      s.passwordEnabled === null
        ? manual("Vérifie dans Boutique en ligne > Préférences.")
        : s.passwordEnabled
          ? fail("La boutique est encore protégée par mot de passe.")
          : pass("Pas de mot de passe."),
  },
  {
    id: "domain_custom",
    category: "domaine",
    severity: "important",
    title: "Nom de domaine propre",
    why: "Une adresse en .myshopify.com inspire moins confiance et ne peut pas être revendiquée comme ton site dans Merchant Center de façon durable.",
    fix: ["Achète ou connecte un nom de domaine dans Paramètres > Domaines.", "Définis-le comme domaine principal.", "Revendique ce domaine dans Merchant Center."],
    source: SRC.guidelines,
    check: ({ s }) =>
      s.primaryDomain.host.endsWith(".myshopify.com")
        ? fail("Le domaine principal est encore en .myshopify.com.")
        : pass(s.primaryDomain.host),
  },

  // ——— Politiques ———
  policyPresence(
    "REFUND_POLICY",
    "bloquant",
    "Google demande une politique de retour et de remboursement claire. Si tu n'acceptes pas les retours, tu dois l'indiquer.",
    POLICY_FIX(POLICY_LABELS.REFUND_POLICY)
  ),
  policyPresence(
    "SHIPPING_POLICY",
    "bloquant",
    "Les frais et délais de livraison doivent être clairs avant l'achat et cohérents avec ceux déclarés dans Merchant Center.",
    POLICY_FIX(POLICY_LABELS.SHIPPING_POLICY)
  ),
  policyPresence(
    "TERMS_OF_SERVICE",
    "important",
    "Google demande que les conditions de facturation soient clairement indiquées. Les CGV sont aussi obligatoires pour vendre à distance dans l'Union européenne.",
    POLICY_FIX(POLICY_LABELS.TERMS_OF_SERVICE)
  ),
  policyPresence(
    "PRIVACY_POLICY",
    "important",
    "Collecter des données personnelles (commande, newsletter) sans politique de confidentialité est un manquement au RGPD et un signal de boutique peu fiable.",
    POLICY_FIX(POLICY_LABELS.PRIVACY_POLICY)
  ),
  policyPresence(
    "LEGAL_NOTICE",
    "important",
    "Les mentions légales identifient l'éditeur du site. Elles sont obligatoires en France et rassurent les relecteurs de Google sur l'identité du vendeur.",
    POLICY_FIX(POLICY_LABELS.LEGAL_NOTICE)
  ),
  {
    id: "policy_placeholders",
    category: "politiques",
    severity: "bloquant",
    title: "Politiques entièrement remplies",
    why: "Un modèle laissé tel quel ([Nom de l'entreprise], XXX…) montre des informations fausses ou manquantes aux clients : c'est un motif de « présentation trompeuse ».",
    fix: ["Ouvre chaque politique signalée dans Paramètres > Politiques.", "Remplace chaque champ entre crochets par la vraie information.", "Relis la page publiée sur ta boutique."],
    source: SRC.misrepresentation,
    check: ({ policyText, policyDocs }) => {
      const items = [...policyText]
        .map(([type, text]) => ({ type, found: placeholdersIn(text) }))
        .filter((x) => x.found.length)
        .map(({ type, found }) => ({ label: docLabel(type, policyDocs), detail: `Trouvé : ${found.join(", ")}`, url: policyDocs.get(type)?.url }));
      return items.length ? fail(`${plural(items.length, "politique")} contien${items.length > 1 ? "nent" : "t"} des champs non remplis.`, items) : pass("Aucun champ de modèle oublié.");
    },
  },
  {
    id: "policy_length",
    category: "politiques",
    severity: "important",
    title: "Politiques suffisamment détaillées",
    why: "Une politique de quelques lignes ne donne pas aux clients les informations attendues (procédure, délais, frais, exceptions).",
    fix: ["Complète les politiques signalées : procédure, délais, frais, exceptions, contact.", "Utilise le générateur de pages légales de l'outil comme point de départ."],
    source: SRC.guidelines,
    check: ({ policyText, policyDocs }) => {
      const items = [...policyText]
        .filter(([type]) => type !== "CONTACT_INFORMATION")
        .map(([type, text]) => ({ type, len: text.length }))
        .filter((x) => x.len < 400)
        .map(({ type, len }) => ({ label: docLabel(type, policyDocs), detail: `${len} caractères seulement.`, url: policyDocs.get(type)?.url }));
      return items.length ? fail(`${plural(items.length, "politique")} très courte${items.length > 1 ? "s" : ""}.`, items) : pass("Longueur suffisante.");
    },
  },
  {
    id: "policy_refund_content",
    category: "politiques",
    severity: "important",
    title: "Délai de retour indiqué",
    why: "Google attend une politique de retour claire : le client doit savoir combien de jours il a pour retourner un produit.",
    fix: [
      "Indique le délai de retour en jours (14 jours minimum dans l'Union européenne pour la rétractation).",
      "Précise qui paie le retour et le délai de remboursement.",
      "Déclare la même politique dans Merchant Center (Paramètres > Retours).",
    ],
    source: SRC.guidelines,
    check: ({ policyText }) => {
      const text = policyText.get("REFUND_POLICY");
      if (!text) return null;
      const delays = returnDelays(text);
      return delays.length ? pass(`Délai(s) indiqué(s) : ${delays.join(", ")} jours.`) : fail("Aucun délai de retour en jours n'a été trouvé dans la politique.");
    },
  },
  {
    id: "policy_shipping_content",
    category: "politiques",
    severity: "important",
    title: "Délais de livraison indiqués",
    why: "Les délais de livraison affichés doivent être clairs et correspondre à ceux déclarés dans Merchant Center.",
    fix: ["Indique le délai de préparation et le délai de livraison, en jours ouvrés, pour chaque zone.", "Reporte les mêmes délais dans Merchant Center (Paramètres > Livraison)."],
    source: SRC.guidelines,
    check: ({ policyText }) => {
      const text = policyText.get("SHIPPING_POLICY");
      if (!text) return null;
      return mentionsDelay(text) ? pass("Un délai est indiqué.") : fail("Aucun délai de livraison chiffré n'a été trouvé.");
    },
  },
  {
    id: "policy_delays_consistency",
    category: "politiques",
    severity: "important",
    title: "Délais de retour cohérents entre les pages",
    why: "Deux délais différents (par exemple 14 jours dans les CGV et 30 jours dans la politique de retour) induisent le client en erreur.",
    fix: ["Choisis un seul délai de retour.", "Corrige la politique de retour et les CGV pour qu'elles indiquent le même.", "Vérifie qu'il correspond à celui déclaré dans Merchant Center."],
    source: SRC.misrepresentation,
    check: ({ policyText }) => {
      const refund = returnDelays(policyText.get("REFUND_POLICY") ?? "");
      const terms = returnDelays(policyText.get("TERMS_OF_SERVICE") ?? "");
      if (!refund.length || !terms.length) return null;
      return refund.some((d) => terms.includes(d))
        ? pass(`Même délai dans la politique de retour et les CGV (${refund.filter((d) => terms.includes(d)).join(", ")} jours).`)
        : fail(`Politique de retour : ${refund.join(", ")} jours ; CGV : ${terms.join(", ")} jours.`);
    },
  },

  // ——— Produits ———
  {
    id: "products_present",
    category: "produits",
    severity: "bloquant",
    title: "Produits actifs en vente",
    why: "Sans produit actif, Merchant Center n'a rien à afficher et le compte ne peut pas être validé.",
    fix: ["Dans Shopify, ouvre Produits.", "Passe au moins un produit complet au statut « Actif » et publie-le sur la boutique en ligne et sur le canal Google."],
    source: SRC.guidelines,
    check: ({ s }) => (s.productsTotal > 0 ? pass(`${plural(s.productsTotal, "produit")} actif${s.productsTotal > 1 ? "s" : ""}.`) : fail("Aucun produit actif.")),
  },
  {
    id: "products_test_content",
    category: "produits",
    severity: "bloquant",
    title: "Aucun contenu de test visible",
    why: "Un texte provisoire (« produit de test », « lorem ipsum »…) montre aux clients une fiche inachevée : Google peut considérer la boutique comme incomplète ou trompeuse.",
    fix: ["Ouvre chaque produit listé.", "Remplace le titre et la description par le texte définitif, ou passe le produit en brouillon tant qu'il n'est pas prêt."],
    source: SRC.misrepresentation,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const m = `${p.title} ${p.description}`.match(TEST_CONTENT)?.[0];
          return m ? `« ${m} »` : false;
        },
        "Aucun texte provisoire repéré.",
        (n) => `${plural(n, "produit")} avec un texte provisoire.`
      ),
  },
  {
    id: "products_image",
    category: "produits",
    severity: "bloquant",
    title: "Image principale présente",
    why: "L'image est obligatoire dans le flux Google : un produit sans image est refusé.",
    fix: ["Ouvre chaque produit listé.", "Ajoute une image nette du produit, sur fond neutre, sans texte ni filigrane, en première position."],
    source: SRC.spec,
    check: (ctx) => productRule(ctx, (p) => !p.hasImage && "", "Tous les produits ont une image.", (n) => `${plural(n, "produit")} sans image.`),
  },
  {
    id: "products_description",
    category: "produits",
    severity: "bloquant",
    title: "Description présente",
    why: "La description fait partie des informations attendues par Google : un produit sans description risque d'être refusé.",
    fix: ["Ouvre chaque produit listé.", "Rédige une description factuelle : matière, dimensions, usage, contenu du colis. Sans majuscules abusives ni promotion."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(ctx, (p) => !p.description.trim() && "", "Tous les produits ont une description.", (n) => `${plural(n, "produit")} sans description.`),
  },
  {
    id: "products_description_short",
    category: "produits",
    severity: "conseil",
    title: "Descriptions assez détaillées",
    why: "Une description de quelques mots aide peu Google à comprendre le produit, et donc à le montrer sur les bonnes recherches.",
    fix: ["Enrichis les descriptions listées : au moins 3 à 5 phrases utiles (caractéristiques, dimensions, matériaux, usage)."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => p.description.trim().length > 0 && p.description.trim().length < 150 && `${p.description.trim().length} caractères.`,
        "Descriptions suffisamment détaillées.",
        (n) => `${plural(n, "description")} de moins de 150 caractères.`
      ),
  },
  {
    id: "products_price_zero",
    category: "produits",
    severity: "bloquant",
    title: "Aucun prix à 0",
    why: "Le prix doit être exact et identique entre le site et le flux. Un prix à 0 est refusé et peut être vu comme trompeur.",
    fix: ["Ouvre chaque produit listé.", "Corrige le prix de chaque variante, ou passe le produit en brouillon s'il n'est pas à vendre."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(ctx, (p) => p.variants.some((v) => v.price <= 0) && "", "Aucun prix à 0.", (n) => `${plural(n, "produit")} avec une variante à 0.`),
  },
  {
    id: "products_compare_at",
    category: "produits",
    severity: "important",
    title: "Prix barrés crédibles",
    why: "Un prix barré très supérieur au prix de vente peut être jugé trompeur. Google n'affiche une promotion que si la remise est réelle (entre 5 % et 90 %), et le droit européen encadre le prix de référence.",
    fix: [
      "Pour chaque produit listé, vérifie que le prix barré a réellement été pratiqué récemment.",
      "Sinon, efface le « Prix avant réduction » dans la fiche produit.",
    ],
    source: SRC.salePrice,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const v = p.variants.find((x) => x.compareAtPrice !== null && x.price > 0 && x.compareAtPrice >= 2 * x.price);
          return v ? `${v.price} au lieu de ${v.compareAtPrice} (-${Math.round((1 - v.price / v.compareAtPrice!) * 100)} %).` : false;
        },
        "Aucun prix barré à plus de 50 % de remise.",
        (n) => `${plural(n, "produit")} affiche${n > 1 ? "nt" : ""} une remise de 50 % ou plus.`
      ),
  },
  {
    id: "products_permanent_sale",
    category: "produits",
    severity: "important",
    title: "Pas de promotion permanente",
    why: "Un prix barré sur presque tout le catalogue ressemble à une fausse promotion : c'est un signal de pratique trompeuse.",
    fix: [
      "Réserve les prix barrés aux vraies promotions, limitées dans le temps.",
      "Retire le « Prix avant réduction » des produits qui ne sont pas réellement en promotion.",
    ],
    source: SRC.misrepresentation,
    check: ({ s }) => {
      if (s.products.length < 5) return null;
      const onSale = s.products.filter((p) => p.variants.some((v) => v.compareAtPrice !== null && v.compareAtPrice > v.price)).length;
      const share = onSale / s.products.length;
      return share >= 0.8
        ? fail(`${Math.round(share * 100)} % des produits analysés ont un prix barré.`)
        : pass(`${Math.round(share * 100)} % des produits ont un prix barré.`);
    },
  },
  {
    id: "products_stock",
    category: "produits",
    severity: "conseil",
    title: "Produits actifs disponibles",
    why: "Un produit actif mais en rupture reste visible : la disponibilité affichée sur Google doit correspondre à celle du site.",
    fix: ["Réapprovisionne les produits listés, ou passe-les en brouillon.", "Si tu vends en précommande, indique-le clairement sur la fiche produit."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => p.tracksInventory && p.totalInventory <= 0 && p.variants.every((v) => v.inventoryPolicy === "DENY") && "Stock à 0.",
        "Tous les produits actifs sont en stock.",
        (n) => `${plural(n, "produit")} actif${n > 1 ? "s" : ""} sans stock.`
      ),
  },
  {
    id: "products_gtin_invalid",
    category: "produits",
    severity: "important",
    title: "Codes-barres valides",
    why: "Un GTIN (code EAN/UPC) faux fait refuser le produit. Mieux vaut ne rien indiquer qu'un code inventé ou une référence interne.",
    fix: [
      "Ouvre chaque produit listé.",
      "Remplace le code-barres par le vrai GTIN du fabricant (8, 12, 13 ou 14 chiffres), ou vide le champ si le produit n'en a pas.",
    ],
    source: SRC.spec,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const bad = p.variants.flatMap((v) => v.barcodes).find((b) => b.trim() && !validGtin(b));
          return bad ? `Code « ${bad} » invalide.` : false;
        },
        "Aucun code-barres invalide.",
        (n) => `${plural(n, "produit")} avec un code-barres invalide.`
      ),
  },
  {
    id: "products_gtin_missing",
    category: "produits",
    severity: "conseil",
    title: "GTIN renseigné quand il existe",
    why: "Google recommande fortement le GTIN quand le produit en a un (produit de marque). Il améliore la visibilité. Un produit fait main ou sans code n'en a pas besoin.",
    fix: ["Si le produit a un code EAN/UPC sur son emballage, saisis-le dans le champ Code-barres de chaque variante.", "Sinon, ne mets rien : n'invente jamais de code."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => p.variants.every((v) => !v.barcodes.some((b) => b.trim())) && "",
        "Tous les produits ont un code-barres.",
        (n) => `${plural(n, "produit")} sans code-barres (normal s'il s'agit de produits sans GTIN).`
      ),
  },
  {
    id: "products_title_promo",
    category: "produits",
    severity: "important",
    title: "Titres sans mention promotionnelle",
    why: "Les titres ne doivent contenir ni promotion, ni prix, ni « livraison gratuite » : ces informations ont leurs propres champs.",
    fix: ["Retire des titres listés les mots promotionnels (promo, -20 %, gratuit, soldes…).", "Garde un titre descriptif : marque, type de produit, attributs clés."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(ctx, (p) => (p.title.match(PROMO)?.[0] ? `« ${p.title.match(PROMO)![0]} »` : false), "Aucun titre promotionnel.", (n) => `${plural(n, "titre")} avec une mention promotionnelle.`),
  },
  {
    id: "products_title_length",
    category: "produits",
    severity: "important",
    title: "Titres de 150 caractères maximum",
    why: "La spécification Google limite le titre à 150 caractères.",
    fix: ["Raccourcis les titres listés : marque, type de produit et 2 attributs clés suffisent."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(ctx, (p) => p.title.length > 150 && `${p.title.length} caractères.`, "Tous les titres font 150 caractères ou moins.", (n) => `${plural(n, "titre")} trop long${n > 1 ? "s" : ""}.`),
  },
  {
    id: "products_title_caps",
    category: "produits",
    severity: "conseil",
    title: "Titres sans majuscules abusives",
    why: "Les mots entièrement en majuscules sont considérés comme une mise en forme abusive, sauf pour les sigles et les marques.",
    fix: ["Écris les titres en minuscules, avec une majuscule en début de mot si tu le souhaites.", "Garde les majuscules uniquement pour les sigles et les noms de marque."],
    source: SRC.spec,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const shouting = p.title.split(/\s+/).filter((w) => w.length > 4 && /\p{L}/u.test(w) && w === w.toUpperCase());
          return shouting.length >= 2 && `Mots : ${shouting.slice(0, 4).join(", ")}.`;
        },
        "Pas de majuscules abusives.",
        (n) => `${plural(n, "titre")} avec des mots en majuscules.`
      ),
  },
  {
    id: "products_title_health",
    category: "produits",
    severity: "important",
    title: "Pas d'allégation de santé dans les titres",
    why: "Promettre de guérir, soigner ou faire maigrir relève des contenus de santé, très encadrés par Google et par la loi.",
    fix: [
      "Retire les promesses de santé des titres et descriptions listés.",
      "Décris le produit de façon factuelle. S'il s'agit d'un produit de santé, vérifie la règle Google pour ton pays avant de le diffuser.",
    ],
    source: SRC.policies,
    check: (ctx) =>
      productRule(ctx, (p) => (p.title.match(HEALTH)?.[0] ? `« ${p.title.match(HEALTH)![0]} »` : false), "Aucune allégation de santé repérée.", (n) => `${plural(n, "titre")} à vérifier.`),
  },
  {
    id: "products_title_imitation",
    category: "produits",
    severity: "bloquant",
    title: "Aucune imitation de marque",
    why: "Les répliques et contrefaçons sont interdites par Google. Une seule infraction grave peut suspendre le compte.",
    fix: ["Retire de la vente les produits qui imitent une marque.", "Si le produit est authentique, supprime les mots « réplique », « inspiré de », « dupe »… du titre et de la description."],
    source: SRC.policies,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const m = `${p.title} ${p.description}`.match(IMITATION)?.[0];
          return m ? `« ${m} »` : false;
        },
        "Aucun mot d'imitation repéré.",
        (n) => `${plural(n, "produit")} à vérifier en priorité.`
      ),
  },
  {
    id: "products_title_brands",
    category: "produits",
    severity: "conseil",
    title: "Marques tierces autorisées",
    why: "Utiliser la marque d'un autre sans autorisation expose au refus des produits et aux plaintes des ayants droit.",
    fix: [
      "Pour chaque produit listé, vérifie que tu vends le produit authentique ou que tu as le droit de citer la marque.",
      "Pour un accessoire compatible, écris « compatible avec » et non le nom de la marque seul.",
    ],
    source: SRC.policies,
    check: (ctx) =>
      productRule(
        ctx,
        (p) => {
          const title = normalize(p.title);
          const brand = WATCHED_BRANDS.find((b) => new RegExp(`\\b${b}\\b`).test(title) && !normalize(p.vendor).includes(b));
          return brand ? `Marque citée : ${brand}.` : false;
        },
        "Aucune marque sensible citée.",
        (n) => `${plural(n, "produit")} cite${n > 1 ? "nt" : ""} une marque tierce.`
      ),
  },

  // ——— Tunnel d'achat ———
  {
    id: "checkout_shipping_zones",
    category: "tunnel",
    severity: "bloquant",
    title: "Zones de livraison configurées",
    why: "Un client doit pouvoir commander depuis les pays où tu diffuses tes produits. Sans zone de livraison, la commande est impossible.",
    fix: ["Dans Shopify, ouvre Paramètres > Expédition et livraison.", "Crée une zone pour chaque pays visé, avec des tarifs et délais cohérents avec ta politique d'expédition."],
    source: SRC.guidelines,
    check: ({ s }) => {
      if (!s.shipping) return manual("Zones non lisibles : vérifie Paramètres > Expédition et livraison.");
      if (!s.shipping.countryCodes.length && !s.shipping.restOfWorld) return fail("Aucune zone de livraison.");
      if (s.address.countryCode && !s.shipping.restOfWorld && !s.shipping.countryCodes.includes(s.address.countryCode)) {
        return fail(`Ton pays (${s.address.countryCode}) ne fait partie d'aucune zone. Zones : ${s.shipping.countryCodes.join(", ")}.`);
      }
      return pass(`Livraison vers : ${s.shipping.countryCodes.slice(0, 12).join(", ")}${s.shipping.restOfWorld ? " et reste du monde" : ""}.`);
    },
  },
  {
    id: "checkout_payments",
    category: "tunnel",
    severity: "bloquant",
    title: "Moyen de paiement classique actif",
    why: "Google exige au moins un moyen de paiement classique (carte bancaire par exemple) et un paiement possible jusqu'au bout.",
    fix: ["Dans Shopify, ouvre Paramètres > Paiements.", "Active un fournisseur de paiement par carte, puis passe une commande test complète."],
    source: SRC.guidelines,
    check: () => manual("Non vérifiable avec un accès en lecture seule : contrôle Paramètres > Paiements et passe une commande test."),
  },
];

/**
 * Beaucoup de boutiques publient leurs politiques comme pages (Boutique en
 * ligne > Pages) plutôt que dans Paramètres > Politiques. Google regarde le
 * site, pas l'emplacement dans Shopify : une page publiée du bon type compte.
 */
const PAGE_PATTERNS: [PolicyType, RegExp][] = [
  ["REFUND_POLICY", /retour|rembourse|retractation|refund|return/],
  ["SHIPPING_POLICY", /livraison|expedition|shipping|delivery/],
  ["TERMS_OF_SERVICE", /\bcgv\b|conditions generales de vente|terms of (sale|service)/],
  ["PRIVACY_POLICY", /confidentialite|privacy|donnees personnelles/],
  ["LEGAL_NOTICE", /mentions[ -]legales|legal notice|imprint/],
  ["CONTACT_INFORMATION", /contact|coordonnees/],
];

/** Exécute toutes les règles sur les données de la boutique et calcule le score. */
export function runAudit(s: ShopSnapshot, checkedAt = Date.now()): AuditReport {
  const policyText = new Map<PolicyType, string>();
  const policyDocs = new Map<PolicyType, PolicyDoc>();
  for (const p of s.policies) {
    const text = htmlToText(p.body);
    if (!text) continue;
    policyText.set(p.type, text);
    policyDocs.set(p.type, { url: p.url });
  }
  const pages = (s.pages ?? [])
    .filter((p) => p.isPublished)
    .map((p) => ({ ...p, key: normalize(`${p.handle} ${p.title}`), text: htmlToText(p.body) }))
    .filter((p) => p.text);
  for (const [type, pattern] of PAGE_PATTERNS) {
    if (policyText.has(type)) continue;
    const page = pages.find((p) => pattern.test(p.key));
    if (!page) continue;
    policyText.set(type, page.text);
    policyDocs.set(type, { url: `https://${s.primaryDomain.host}/pages/${page.handle}`, page: page.title });
  }
  const contactText = [policyText.get("CONTACT_INFORMATION"), policyText.get("LEGAL_NOTICE")].filter(Boolean).join("\n");
  const store = s.myshopifyDomain.replace(/\.myshopify\.com$/, "");
  const ctx: Context = {
    s,
    policyText,
    policyDocs,
    contactText,
    adminProductUrl: (id) => `https://admin.shopify.com/store/${store}/products/${id.split("/").pop()}`,
  };

  const results: AuditResult[] = [];
  for (const rule of RULES) {
    const outcome = rule.check(ctx);
    if (!outcome) continue;
    results.push({
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      title: rule.title,
      why: rule.why,
      fix: rule.fix,
      source: rule.source,
      ...outcome,
    });
  }

  const failed = results.filter((r) => r.status === "fail");
  const counts: Record<Severity, number> = { bloquant: 0, important: 0, conseil: 0 };
  for (const r of failed) counts[r.severity]++;
  let score = Math.max(0, 100 - failed.reduce((t, r) => t + PENALTY[r.severity], 0));
  if (counts.bloquant > 0) score = Math.min(score, BLOCKING_CAP);

  return {
    version: 2,
    shop: s.name,
    domain: s.primaryDomain.host,
    checkedAt,
    score,
    counts,
    passed: results.filter((r) => r.status === "pass").length,
    manual: results.filter((r) => r.status === "manual").length,
    productsAudited: s.products.length,
    productsTotal: s.productsTotal,
    results,
  };
}

const SEVERITY_ORDER: Record<Severity, number> = { bloquant: 0, important: 1, conseil: 2 };

/** Points à corriger, du plus grave au moins grave. */
export function prioritized(report: AuditReport): AuditResult[] {
  return report.results.filter((r) => r.status === "fail").sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
