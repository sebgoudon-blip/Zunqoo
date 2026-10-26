import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { TITLE_MAX, contactPageHtml, fixTestContent, fixTitle, type FixKind } from "./audit";
import { REGION, consumeQuota, refundQuota, requireUid } from "./common";
import { accessTokenFor, adminGraphql, canFix, shopRef, shopifySecrets, type StoredShop } from "./shopify";

/**
 * Corrections en un clic. Trois étapes, toujours dans cet ordre :
 * 1. htpFixPreview lit les valeurs actuelles et propose une correction ;
 * 2. le marchand relit l'avant/après, peut modifier les titres, et confirme ;
 * 3. htpFixApply relit Shopify, refuse si la valeur a changé entre-temps,
 *    applique, et garde l'ancienne valeur pour pouvoir annuler (htpFixUndo).
 */

const MAX_CHANGES = 50;
const DAILY_FIXES_PER_USER = 100;
const PRODUCT_ID = /^gid:\/\/shopify\/Product\/\d+$/;
const KINDS: FixKind[] = ["product_title", "product_description", "contact_page"];

const changesRef = () => getFirestore().collection("htpChanges");

export interface ProposedChange {
  kind: FixKind;
  /** Produit ou page modifié ; null pour une page Contact à créer. */
  id: string | null;
  label: string;
  before: string;
  after: string;
}

interface StoredChange extends ProposedChange {
  uid: string;
  shop: string;
  /** La page Contact a été créée par cette correction. */
  createdPage: boolean;
  appliedAt: Timestamp;
  undoneAt: Timestamp | null;
}

type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

/** Requête GraphQL qui lève une erreur lisible au lieu de renvoyer des erreurs partielles. */
function gqlFor(shop: string, token: string): Gql {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
    const res = await adminGraphql<T>(shop, token, query, variables);
    if (!res.data || res.errors?.length) {
      logger.error("Requête Shopify refusée", { message: res.errors?.map((e) => e.message).join("; ") });
      throw new HttpsError("internal", "Shopify a refusé la demande. Réessaie plus tard.");
    }
    return res.data;
  };
}

interface ProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
}

async function readProducts(gql: Gql, ids: string[]): Promise<ProductNode[]> {
  const data = await gql<{ nodes: (ProductNode | null)[] }>(
    `query HtpFixProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title descriptionHtml } } }`,
    { ids }
  );
  return data.nodes.filter((n): n is ProductNode => !!n?.id);
}

interface ContactState {
  page: { id: string; body: string } | null;
  html: string;
  shopName: string;
}

async function readContact(gql: Gql): Promise<ContactState> {
  const data = await gql<{
    shop: { name: string; contactEmail: string; shopAddress: { company: string | null; formatted: string[]; phone: string | null } };
    pages: { nodes: { id: string; handle: string; body: string }[] };
  }>(
    `query HtpFixContact {
      shop { name contactEmail shopAddress { company formatted phone } }
      pages(first: 5, query: "handle:contact") { nodes { id handle body } }
    }`
  );
  const { shop } = data;
  const page = data.pages.nodes.find((p) => p.handle === "contact") ?? null;
  return {
    page: page ? { id: page.id, body: page.body } : null,
    shopName: shop.name,
    html: contactPageHtml({
      name: shop.name,
      company: shop.shopAddress.company ?? "",
      addressLines: shop.shopAddress.formatted.filter((l) => l !== shop.shopAddress.company),
      email: shop.contactEmail ?? "",
      phone: shop.shopAddress.phone ?? "",
    }),
  };
}

const hasText = (html: string) => html.replace(/<[^>]+>/g, "").trim().length > 0;

function productIds(input: unknown): string[] {
  const ids = Array.isArray(input) ? input.filter((id): id is string => typeof id === "string" && PRODUCT_ID.test(id)) : [];
  if (!ids.length) throw new HttpsError("invalid-argument", "Aucun produit à corriger.");
  return [...new Set(ids)].slice(0, MAX_CHANGES);
}

/** Étape 1 : propose les corrections, sans rien modifier (lecture seule). */
export const htpFixPreview = onCall(
  { region: REGION, secrets: shopifySecrets, timeoutSeconds: 60 },
  async (request: CallableRequest<{ kind: FixKind; ids?: string[] }>) => {
    const uid = requireUid(request);
    const kind = request.data?.kind;
    if (!KINDS.includes(kind)) throw new HttpsError("invalid-argument", "Type de correction inconnu.");
    const { shop, token } = await accessTokenFor(uid);
    const gql = gqlFor(shop, token);

    const changes: ProposedChange[] = [];
    if (kind === "contact_page") {
      const contact = await readContact(gql);
      // Une page Contact qui a déjà du texte n'est jamais remplacée.
      if (!contact.page || !hasText(contact.page.body)) {
        changes.push({ kind, id: contact.page?.id ?? null, label: "Page Contact", before: contact.page?.body ?? "", after: contact.html });
      }
    } else {
      for (const p of await readProducts(gql, productIds(request.data?.ids))) {
        const before = kind === "product_title" ? p.title : p.descriptionHtml;
        const after = kind === "product_title" ? fixTitle(before) : fixTestContent(before);
        if (after) changes.push({ kind, id: p.id, label: p.title, before, after });
      }
    }
    return { changes };
  }
);

/** Titre saisi ou validé par le marchand : texte simple, 1 à 150 caractères. */
function validTitle(title: unknown): string {
  const t = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (!t || t.length > TITLE_MAX || /[<>]/.test(t)) {
    throw new HttpsError("invalid-argument", `Chaque titre doit faire entre 1 et ${TITLE_MAX} caractères, sans balise.`);
  }
  return t;
}

async function updateProduct(gql: Gql, id: string, fields: { title?: string; descriptionHtml?: string }) {
  const data = await gql<{ productUpdate: { product: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation HtpFixProduct($product: ProductUpdateInput!) {
      productUpdate(product: $product) { product { id } userErrors { message } }
    }`,
    { product: { id, ...fields } }
  );
  const error = data.productUpdate.userErrors[0]?.message;
  if (error || !data.productUpdate.product) throw new HttpsError("failed-precondition", error ?? "Mise à jour refusée par Shopify.");
}

async function writePage(gql: Gql, page: { id: string | null; body: string; isPublished?: boolean }): Promise<string> {
  if (page.id) {
    const data = await gql<{ pageUpdate: { page: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation HtpFixPageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) { page { id } userErrors { message } }
      }`,
      { id: page.id, page: { body: page.body, ...(page.isPublished === undefined ? {} : { isPublished: page.isPublished }) } }
    );
    const error = data.pageUpdate.userErrors[0]?.message;
    if (error || !data.pageUpdate.page) throw new HttpsError("failed-precondition", error ?? "Mise à jour refusée par Shopify.");
    return data.pageUpdate.page.id;
  }
  const data = await gql<{ pageCreate: { page: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation HtpFixPageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) { page { id } userErrors { message } }
    }`,
    { page: { title: "Contact", handle: "contact", body: page.body, isPublished: true } }
  );
  const error = data.pageCreate.userErrors[0]?.message;
  if (error || !data.pageCreate.page) throw new HttpsError("failed-precondition", error ?? "Création refusée par Shopify.");
  return data.pageCreate.page.id;
}

async function requireFixAccess(uid: string) {
  const stored = (await shopRef(uid).get()).data() as StoredShop | undefined;
  if (stored && !canFix(stored.scope)) {
    throw new HttpsError("failed-precondition", "Ta boutique est connectée en lecture seule. Autorise les corrections pour continuer.");
  }
}

interface ApplyResult {
  id: string | null;
  ok: boolean;
  changeId?: string;
  error?: string;
}

/** Étape 3 : applique les corrections confirmées par le marchand. */
export const htpFixApply = onCall(
  { region: REGION, secrets: shopifySecrets, timeoutSeconds: 120 },
  async (request: CallableRequest<{ changes: ProposedChange[] }>) => {
    const uid = requireUid(request);
    const input = Array.isArray(request.data?.changes) ? request.data.changes : [];
    if (!input.length || input.length > MAX_CHANGES) {
      throw new HttpsError("invalid-argument", `Entre 1 et ${MAX_CHANGES} corrections à la fois.`);
    }
    if (input.some((c) => !KINDS.includes(c?.kind) || typeof c.before !== "string" || typeof c.after !== "string")) {
      throw new HttpsError("invalid-argument", "Correction invalide.");
    }
    await requireFixAccess(uid);
    const { shop, token } = await accessTokenFor(uid);
    await consumeQuota(uid, "fix", DAILY_FIXES_PER_USER, input.length);
    const gql = gqlFor(shop, token);

    const results: ApplyResult[] = [];
    const ids = input.filter((c) => c.kind !== "contact_page" && typeof c.id === "string" && PRODUCT_ID.test(c.id)).map((c) => c.id!);
    let products: ProductNode[] = [];
    let contact: ContactState | null = null;
    try {
      // Relecture des valeurs actuelles : on ne corrige que ce qui n'a pas changé depuis l'aperçu.
      products = ids.length ? await readProducts(gql, ids) : [];
      contact = input.some((c) => c.kind === "contact_page") ? await readContact(gql) : null;
    } catch (err) {
      await refundQuota(uid, "fix", input.length);
      throw err;
    }

    for (const change of input) {
      try {
        let after = change.after;
        let createdPage = false;
        let targetId = change.id;
        if (change.kind === "contact_page") {
          // Le contenu est recalculé côté serveur : rien d'autre ne peut être publié.
          if (!contact || (contact.page && hasText(contact.page.body)) || (contact.page?.body ?? "") !== change.before) {
            throw new HttpsError("aborted", "La page Contact a changé depuis l'aperçu. Relance l'aperçu.");
          }
          after = contact.html;
          createdPage = !contact.page;
          targetId = await writePage(gql, { id: contact.page?.id ?? null, body: after });
        } else {
          const product = products.find((p) => p.id === change.id);
          const current = change.kind === "product_title" ? product?.title : product?.descriptionHtml;
          if (!product || current !== change.before) {
            throw new HttpsError("aborted", "Ce produit a été modifié depuis l'aperçu. Relance l'aperçu.");
          }
          if (change.kind === "product_title") {
            after = validTitle(change.after);
            await updateProduct(gql, product.id, { title: after });
          } else {
            // La description n'est pas modifiable à la main ici : seule la correction proposée est acceptée.
            const expected = fixTestContent(current);
            if (!expected || expected !== change.after) throw new HttpsError("invalid-argument", "Correction de description invalide.");
            await updateProduct(gql, product.id, { descriptionHtml: expected });
          }
        }
        const doc = await changesRef().add({
          kind: change.kind,
          id: targetId,
          label: String(change.label ?? "").slice(0, 200),
          before: change.before,
          after,
          uid,
          shop,
          createdPage,
          appliedAt: FieldValue.serverTimestamp(),
          undoneAt: null,
        });
        results.push({ id: targetId, ok: true, changeId: doc.id });
      } catch (err) {
        results.push({ id: change.id, ok: false, error: err instanceof HttpsError ? err.message : "Échec de la correction." });
      }
    }
    await refundQuota(uid, "fix", results.filter((r) => !r.ok).length);
    return { results };
  }
);

/** Rétablit la valeur d'avant une correction, si personne ne l'a modifiée depuis. */
export const htpFixUndo = onCall({ region: REGION, secrets: shopifySecrets }, async (request: CallableRequest<{ changeId: string }>) => {
  const uid = requireUid(request);
  const changeId = String(request.data?.changeId ?? "");
  const ref = changesRef().doc(changeId || "-");
  const snap = await ref.get();
  const change = snap.data() as StoredChange | undefined;
  if (!change || change.uid !== uid) throw new HttpsError("not-found", "Correction introuvable.");
  if (change.undoneAt) throw new HttpsError("failed-precondition", "Cette correction a déjà été annulée.");
  await requireFixAccess(uid);
  const { shop, token } = await accessTokenFor(uid);
  if (shop !== change.shop) throw new HttpsError("failed-precondition", "Cette correction concerne une autre boutique.");
  const gql = gqlFor(shop, token);

  if (change.kind === "contact_page") {
    const contact = await readContact(gql);
    if (!contact.page || contact.page.id !== change.id || contact.page.body !== change.after) {
      throw new HttpsError("aborted", "La page Contact a été modifiée depuis : annule à la main dans Shopify.");
    }
    // Une page créée par la correction est dépubliée plutôt que supprimée.
    await writePage(gql, change.createdPage ? { id: change.id, body: change.after, isPublished: false } : { id: change.id, body: change.before });
  } else {
    const [product] = await readProducts(gql, [change.id!]);
    const current = change.kind === "product_title" ? product?.title : product?.descriptionHtml;
    if (!product || current !== change.after) {
      throw new HttpsError("aborted", "Ce produit a été modifié depuis : annule à la main dans Shopify.");
    }
    await updateProduct(gql, product.id, change.kind === "product_title" ? { title: change.before } : { descriptionHtml: change.before });
  }
  await ref.update({ undoneAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/** Dernières corrections de l'utilisateur, pour les annuler depuis l'app. */
export const htpFixHistory = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const snap = await changesRef().where("uid", "==", uid).limit(200).get();
  const changes = snap.docs
    .map((d) => ({ d, data: d.data() as StoredChange }))
    .sort((a, b) => (b.data.appliedAt?.toMillis() ?? 0) - (a.data.appliedAt?.toMillis() ?? 0))
    .slice(0, 30)
    .map(({ d, data }) => ({
      changeId: d.id,
      kind: data.kind,
      label: data.label,
      before: data.before,
      after: data.after,
      appliedAt: data.appliedAt?.toMillis() ?? 0,
      undone: !!data.undoneAt,
    }));
  return { changes };
});
