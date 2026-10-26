/**
 * Tests de bout en bout : vraies Cloud Functions et vraies règles Firestore
 * dans les émulateurs, avec un faux Shopify local. Aucun service en ligne.
 * Lancement : npm run test:e2e
 */
import { createServer, type Server } from "node:http";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeResponse } from "../functions/test/fakeShopify";

const PROJECT = "demo-htp";
const FUNCTIONS = `http://127.0.0.1:5101/${PROJECT}/europe-west1`;
const AUTH = "http://127.0.0.1:9199";
const FIRESTORE = "http://127.0.0.1:8180";
const READ_SCOPES = "read_products,read_content,read_legal_policies";
const FIX_SCOPES = `${READ_SCOPES},write_products,write_online_store_pages,write_legal_policies`;

/** Requêtes reçues par le faux Shopify. */
const received: { op: string; token: string | undefined; mutation: boolean; variables?: any }[] = [];

/** État modifiable du faux Shopify pour les corrections. */
const store = {
  products: new Map<string, { title: string; descriptionHtml: string }>(),
  contact: null as { id: string; body: string; isPublished: boolean } | null,
};

function resetStore() {
  store.products = new Map([
    ["gid://shopify/Product/1", { title: "Lampe en laiton PROMO", descriptionHtml: "<p>Lampe de bureau en laiton.</p>" }],
    ["gid://shopify/Product/3", { title: "Lampe en laiton 3", descriptionHtml: "<p>Produit de test — contenu provisoire.Lampe en laiton massif.</p>" }],
  ]);
  store.contact = null;
}

/** Réponses du faux Shopify aux requêtes de correction ; null pour les autres. */
function fixResponse(query: string, variables: any): unknown | null {
  const op = query.match(/(?:query|mutation) (\w+)/)?.[1];
  switch (op) {
    case "HtpFixProducts":
      return { data: { nodes: variables.ids.map((id: string) => (store.products.has(id) ? { id, ...store.products.get(id) } : null)) } };
    case "HtpFixContact":
      return {
        data: {
          shop: { name: "Boutique Test", contactEmail: "contact@boutique-test.fr", shopAddress: { company: "Boutique Test SAS", formatted: ["1 rue du Test", "75001 Paris"], phone: null } },
          pages: { nodes: store.contact ? [{ id: store.contact.id, handle: "contact", body: store.contact.body }] : [] },
        },
      };
    case "HtpFixProduct": {
      const { id, ...fields } = variables.product;
      store.products.set(id, { ...store.products.get(id)!, ...fields });
      return { data: { productUpdate: { product: { id }, userErrors: [] } } };
    }
    case "HtpFixPageCreate":
      store.contact = { id: "gid://shopify/Page/99", body: variables.page.body, isPublished: true };
      return { data: { pageCreate: { page: { id: store.contact.id }, userErrors: [] } } };
    case "HtpFixPageUpdate":
      store.contact = { ...store.contact!, ...variables.page };
      return { data: { pageUpdate: { page: { id: variables.id }, userErrors: [] } } };
    default:
      return null;
  }
}
let server: Server;
let app: App;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { query = "", variables } = JSON.parse(body || "{}");
      received.push({
        op: query.match(/(?:query|mutation) (\w+)/)?.[1] ?? "",
        token: req.headers["x-shopify-access-token"] as string | undefined,
        mutation: /^\s*mutation/.test(query),
        variables,
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(fixResponse(query, variables) ?? fakeResponse(query, variables, { products: 30 })));
    });
  });
  await new Promise<void>((resolve) => server.listen(8799, "127.0.0.1", resolve));
  app = initializeApp({ projectId: PROJECT }, "e2e");
});

afterAll(async () => {
  server?.close();
  if (app) await deleteApp(app);
});

/** Crée un utilisateur dans l'émulateur et renvoie son jeton d'identité. */
async function signUp(): Promise<{ uid: string; idToken: string }> {
  const email = `marchand-${Math.random().toString(36).slice(2)}@test.dev`;
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "motdepasse-test", returnSecureToken: true }),
  });
  const data = (await res.json()) as { localId: string; idToken: string };
  return { uid: data.localId, idToken: data.idToken };
}

async function connectShop(uid: string, scope = READ_SCOPES) {
  await getFirestore(app).collection("htpShops").doc(uid).set({
    shop: "boutique-test.myshopify.com",
    accessToken: `jeton-${uid}`,
    refreshToken: null,
    expiresAt: null,
    scope,
  });
}

/** Appelle une fonction « callable » comme le ferait le SDK client. */
async function call(name: string, data: unknown, idToken?: string) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return (await res.json()) as { result?: any; error?: { status: string; message: string } };
}

describe("audit de conformité (émulateurs)", () => {
  it("refuse un visiteur non connecté", async () => {
    const res = await call("htpShopifyAudit", {});
    expect(res.error?.status).toBe("UNAUTHENTICATED");
  });

  it("demande de connecter une boutique d'abord", async () => {
    const { idToken } = await signUp();
    const res = await call("htpShopifyAudit", {}, idToken);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");
  });

  it("audite la boutique en lecture seule et renvoie un rapport classé", async () => {
    const { uid, idToken } = await signUp();
    await connectShop(uid);
    received.length = 0;

    const res = await call("htpShopifyAudit", { address: "1 rue du Test 75001 Paris" }, idToken);
    expect(res.error).toBeUndefined();
    const report = res.result;
    expect(report.version).toBe(2);
    expect(report.shop).toBe("Boutique Test");
    expect(report.productsAudited).toBe(30);
    const status = (id: string) => report.results.find((r: { id: string }) => r.id === id)?.status;
    expect(status("products_image")).toBe("fail");
    expect(status("products_title_promo")).toBe("fail");
    expect(status("domain_custom")).toBe("fail");
    expect(status("identity_profile_address")).toBe("pass");
    expect(report.counts.bloquant).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(59);

    // Le jeton stocké côté serveur est utilisé, et aucune écriture n'est envoyée à Shopify.
    expect(received.length).toBeGreaterThan(0);
    expect(received.every((r) => r.token === `jeton-${uid}`)).toBe(true);
    expect(received.some((r) => r.mutation)).toBe(false);
  });

  it("limite le nombre d'audits par jour et par utilisateur", async () => {
    const { uid, idToken } = await signUp();
    await connectShop(uid);
    for (let i = 0; i < 10; i++) {
      const ok = await call("htpShopifyAudit", {}, idToken);
      expect(ok.error, `audit ${i + 1}`).toBeUndefined();
    }
    const res = await call("htpShopifyAudit", {}, idToken);
    expect(res.error?.status).toBe("RESOURCE_EXHAUSTED");
  });

  it("refuse de publier les politiques avec un accès en lecture seule", async () => {
    const { uid, idToken } = await signUp();
    await connectShop(uid);
    received.length = 0;
    const res = await call("htpShopifyPublishLegal", { policies: { REFUND_POLICY: "Retours sous 14 jours." } }, idToken);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");
    expect(received).toHaveLength(0);
  });

  it("demande les accès en lecture seule par défaut", async () => {
    const { idToken } = await signUp();
    const read = await call("htpShopifyStart", { shop: "boutique-test" }, idToken);
    const scope = new URL(read.result.url).searchParams.get("scope");
    expect(scope).toBe(READ_SCOPES);
    const write = await call("htpShopifyStart", { shop: "boutique-test", access: "fix" }, idToken);
    expect(new URL(write.result.url).searchParams.get("scope")).toBe(FIX_SCOPES);
  });
});

describe("corrections en un clic (émulateurs)", () => {
  const P1 = "gid://shopify/Product/1";
  const P3 = "gid://shopify/Product/3";

  it("propose un aperçu même en lecture seule, mais refuse d'appliquer", async () => {
    resetStore();
    const { uid, idToken } = await signUp();
    await connectShop(uid);
    const preview = await call("htpFixPreview", { kind: "product_title", ids: [P1, P3] }, idToken);
    expect(preview.result.changes).toEqual([{ kind: "product_title", id: P1, label: "Lampe en laiton PROMO", before: "Lampe en laiton PROMO", after: "Lampe en laiton" }]);

    received.length = 0;
    const apply = await call("htpFixApply", { changes: preview.result.changes }, idToken);
    expect(apply.error?.status).toBe("FAILED_PRECONDITION");
    expect(received.some((r) => r.mutation)).toBe(false);
  });

  it("applique un titre modifié par le marchand, puis l'annule", async () => {
    resetStore();
    const { uid, idToken } = await signUp();
    await connectShop(uid, FIX_SCOPES);
    const [change] = (await call("htpFixPreview", { kind: "product_title", ids: [P1] }, idToken)).result.changes;
    const apply = await call("htpFixApply", { changes: [{ ...change, after: "Lampe de bureau en laiton" }] }, idToken);
    expect(apply.result.results[0]).toMatchObject({ id: P1, ok: true });
    expect(store.products.get(P1)!.title).toBe("Lampe de bureau en laiton");

    const history = await call("htpFixHistory", {}, idToken);
    expect(history.result.changes[0]).toMatchObject({ kind: "product_title", before: "Lampe en laiton PROMO", after: "Lampe de bureau en laiton", undone: false });

    const undo = await call("htpFixUndo", { changeId: apply.result.results[0].changeId }, idToken);
    expect(undo.result).toEqual({ ok: true });
    expect(store.products.get(P1)!.title).toBe("Lampe en laiton PROMO");
    const again = await call("htpFixUndo", { changeId: apply.result.results[0].changeId }, idToken);
    expect(again.error?.status).toBe("FAILED_PRECONDITION");
  });

  it("n'écrase pas une valeur modifiée depuis l'aperçu", async () => {
    resetStore();
    const { uid, idToken } = await signUp();
    await connectShop(uid, FIX_SCOPES);
    const [change] = (await call("htpFixPreview", { kind: "product_title", ids: [P1] }, idToken)).result.changes;
    store.products.get(P1)!.title = "Titre changé dans Shopify";
    const apply = await call("htpFixApply", { changes: [change] }, idToken);
    expect(apply.result.results[0].ok).toBe(false);
    expect(store.products.get(P1)!.title).toBe("Titre changé dans Shopify");
  });

  it("n'accepte que la description proposée par le serveur", async () => {
    resetStore();
    const { uid, idToken } = await signUp();
    await connectShop(uid, FIX_SCOPES);
    const [change] = (await call("htpFixPreview", { kind: "product_description", ids: [P1, P3] }, idToken)).result.changes;
    expect(change.after).toBe("<p>Lampe en laiton massif.</p>");
    const tampered = await call("htpFixApply", { changes: [{ ...change, after: "<script>x()</script>" }] }, idToken);
    expect(tampered.result.results[0].ok).toBe(false);
    const ok = await call("htpFixApply", { changes: [change] }, idToken);
    expect(ok.result.results[0].ok).toBe(true);
    expect(store.products.get(P3)!.descriptionHtml).toBe("<p>Lampe en laiton massif.</p>");
  });

  it("crée la page Contact à partir des réglages, et l'annulation la dépublie", async () => {
    resetStore();
    const { uid, idToken } = await signUp();
    await connectShop(uid, FIX_SCOPES);
    const [change] = (await call("htpFixPreview", { kind: "contact_page" }, idToken)).result.changes;
    expect(change.after).toContain("contact@boutique-test.fr");
    const apply = await call("htpFixApply", { changes: [{ ...change, after: "<p>autre contenu</p>" }] }, idToken);
    expect(apply.result.results[0].ok).toBe(true);
    // Le contenu publié est celui calculé par le serveur, pas celui envoyé par le client.
    expect(store.contact?.body).toBe(change.after);
    await call("htpFixUndo", { changeId: apply.result.results[0].changeId }, idToken);
    expect(store.contact?.isPublished).toBe(false);
  });
});

describe("règles Firestore (émulateur)", () => {
  const read = (path: string, idToken: string) =>
    fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

  it("le client ne peut lire ni les jetons Shopify ni les quotas", async () => {
    const { uid, idToken } = await signUp();
    await connectShop(uid);
    expect((await read(`htpShops/${uid}`, idToken)).status).toBe(403);
    expect((await read(`htpUsage/${uid}_${new Date().toISOString().slice(0, 10)}`, idToken)).status).toBe(403);
    expect((await read("htpChanges/quelconque", idToken)).status).toBe(403);
  });

  it("un utilisateur ne lit que son propre profil", async () => {
    const alice = await signUp();
    const bob = await signUp();
    await getFirestore(app).collection("htpUsers").doc(alice.uid).set({ note: "privé" });
    expect((await read(`htpUsers/${alice.uid}`, alice.idToken)).status).toBe(200);
    expect((await read(`htpUsers/${alice.uid}`, bob.idToken)).status).toBe(403);
  });
});

// Vérifie que l'utilisateur de test existe bien dans l'émulateur d'authentification.
it("l'émulateur d'authentification est utilisé", async () => {
  const { uid } = await signUp();
  expect((await getAuth(app).getUser(uid)).uid).toBe(uid);
});
