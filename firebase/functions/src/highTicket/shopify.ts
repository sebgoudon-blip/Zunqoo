import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { runAudit } from "./audit";
import { collectSnapshot } from "./collect";
import { REGION, consumeQuota, refundQuota, requireUid } from "./common";

const shopifyClientId = defineSecret("SHOPIFY_CLIENT_ID");
const shopifyClientSecret = defineSecret("SHOPIFY_CLIENT_SECRET");
/** URL publique de l'app HighTicket Pilot, par exemple https://hightiket.web.app (sans / final). */
const appUrl = defineString("HTP_APP_URL");

const API_VERSION = "2026-10";
// Accès minimaux : l'audit ne fait que lire. Le droit d'écrire les politiques
// n'est demandé que si le marchand veut publier ses pages légales depuis l'app.
const READ_SCOPES = "read_products,read_content,read_legal_policies";
const PUBLISH_SCOPES = `${READ_SCOPES},write_legal_policies`;
const canPublish = (scope: string) => scope.split(",").includes("write_legal_policies");

const DAILY_AUDITS_PER_USER = 10;
const DAILY_AUDITS_PER_SHOP = 20;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const STATE_TTL_MS = 10 * 60 * 1000;

const db = () => getFirestore();
const callbackUrl = () => `${appUrl.value()}/api/shopify/callback`;

/**
 * Adresse des API Shopify. Dans l'émulateur uniquement, les tests de bout en
 * bout la remplacent par un faux serveur Shopify local.
 */
function shopifyOrigin(shop: string): string {
  const mock = process.env.FUNCTIONS_EMULATOR === "true" ? process.env.HTP_SHOPIFY_MOCK_ORIGIN : undefined;
  return mock || `https://${shop}`;
}

// Les jetons d'accès vivent dans une collection que les règles Firestore interdisent
// au client : ils ne quittent jamais le serveur.
const shopRef = (uid: string) => db().collection("htpShops").doc(uid);
const publicRef = (uid: string) => db().collection("htpUsers").doc(uid);

interface StoredShop {
  shop: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Timestamp | null;
  scope: string;
}

interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
}

function normalizeShop(input: unknown): string {
  const shop = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const full = shop.includes(".") ? shop : `${shop}.myshopify.com`;
  if (!SHOP_DOMAIN.test(full)) {
    throw new HttpsError("invalid-argument", "Indique l'adresse en .myshopify.com de ta boutique (ex. ma-boutique.myshopify.com).");
  }
  return full;
}

/** Vérifie la signature HMAC des paramètres que Shopify ajoute à l'URL de retour. */
function validHmac(query: Record<string, unknown>, secret: string): boolean {
  const { hmac, ...rest } = query;
  if (typeof hmac !== "string") return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? (rest[k] as string[]).join(",") : String(rest[k])}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function tokenRequest(shop: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${shopifyOrigin(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: shopifyClientId.value(),
      client_secret: shopifyClientSecret.value(),
      ...body,
    }),
  });
  if (!res.ok) {
    logger.error("Échange de jeton Shopify refusé", { shop, status: res.status });
    throw new Error(`Shopify token endpoint: ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

function tokenFields(t: TokenResponse) {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: t.expires_in ? Timestamp.fromMillis(Date.now() + t.expires_in * 1000) : null,
    scope: t.scope,
  };
}

/** Jeton valide pour l'utilisateur, renouvelé s'il expire dans moins de 5 minutes. */
async function accessTokenFor(uid: string): Promise<{ shop: string; token: string }> {
  const snap = await shopRef(uid).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Aucune boutique Shopify connectée.");
  }
  const stored = snap.data() as StoredShop;
  const expiresSoon = stored.expiresAt && stored.expiresAt.toMillis() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon) return { shop: stored.shop, token: stored.accessToken };
  if (!stored.refreshToken) {
    throw new HttpsError("failed-precondition", "La connexion Shopify a expiré. Reconnecte ta boutique.");
  }
  try {
    const refreshed = await tokenRequest(stored.shop, {
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    });
    await shopRef(uid).set(tokenFields(refreshed), { merge: true });
    return { shop: stored.shop, token: refreshed.access_token };
  } catch {
    throw new HttpsError("failed-precondition", "La connexion Shopify a expiré. Reconnecte ta boutique.");
  }
}

interface GraphqlResult<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

async function adminGraphql<T>(shop: string, token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`${shopifyOrigin(shop)}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new HttpsError("permission-denied", "Shopify a refusé l'accès. Reconnecte ta boutique.");
  }
  if (!res.ok) {
    throw new HttpsError("unavailable", `Shopify ne répond pas (${res.status}). Réessaie plus tard.`);
  }
  return (await res.json()) as GraphqlResult<T>;
}

/** Étape 1 : génère l'URL d'autorisation Shopify pour l'utilisateur connecté. */
export const htpShopifyStart = onCall(
  { region: REGION, secrets: [shopifyClientId] },
  async (request: CallableRequest<{ shop: string; publish?: boolean }>) => {
    const uid = requireUid(request);
    const shop = normalizeShop(request.data?.shop);
    const scope = request.data?.publish === true ? PUBLISH_SCOPES : READ_SCOPES;
    const state = randomBytes(24).toString("hex");
    await db().collection("htpOAuthStates").doc(state).set({ uid, shop, createdAt: FieldValue.serverTimestamp() });
    const params = new URLSearchParams({
      client_id: shopifyClientId.value(),
      scope,
      redirect_uri: callbackUrl(),
      state,
    });
    return { url: `https://${shop}/admin/oauth/authorize?${params}` };
  }
);

/** Étape 2 : Shopify renvoie ici après l'accord du marchand (via la réécriture /api/shopify/callback). */
export const htpShopifyCallback = onRequest(
  { region: REGION, secrets: [shopifyClientId, shopifyClientSecret] },
  async (req, res) => {
    const back = (status: string) => res.redirect(302, `${appUrl.value()}/boutique?shopify=${status}`);
    try {
      const query = req.query as Record<string, unknown>;
      const shop = String(query.shop ?? "");
      const state = String(query.state ?? "");
      const code = String(query.code ?? "");

      if (!SHOP_DOMAIN.test(shop) || !code || !state || !validHmac(query, shopifyClientSecret.value())) {
        back("invalid");
        return;
      }

      const stateRef = db().collection("htpOAuthStates").doc(state);
      const stateSnap = await stateRef.get();
      await stateRef.delete();
      const saved = stateSnap.data() as { uid: string; shop: string; createdAt?: Timestamp } | undefined;
      const fresh = saved?.createdAt && Date.now() - saved.createdAt.toMillis() < STATE_TTL_MS;
      if (!saved || saved.shop !== shop || !fresh) {
        back("expired");
        return;
      }

      const token = await tokenRequest(shop, { code, expiring: "1" });
      await shopRef(saved.uid).set({ shop, ...tokenFields(token), connectedAt: FieldValue.serverTimestamp() });
      await publicRef(saved.uid).set(
        { shopify: { shop, canPublish: canPublish(token.scope), connectedAt: FieldValue.serverTimestamp() } },
        { merge: true }
      );
      back("connected");
    } catch (err) {
      logger.error("Échec de la connexion Shopify", err);
      back("error");
    }
  }
);

export const htpShopifyDisconnect = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  await shopRef(uid).delete();
  await publicRef(uid).set({ shopify: FieldValue.delete() }, { merge: true });
  return { ok: true };
});

const POLICY_TYPES = [
  "LEGAL_NOTICE",
  "TERMS_OF_SERVICE",
  "REFUND_POLICY",
  "SHIPPING_POLICY",
  "PRIVACY_POLICY",
  "CONTACT_INFORMATION",
] as const;
type PolicyType = (typeof POLICY_TYPES)[number];

/**
 * Audit de conformité Merchant Center : lit la boutique en lecture seule, puis
 * applique les règles de ./audit. Limité par utilisateur et par boutique.
 */
export const htpShopifyAudit = onCall(
  { region: REGION, secrets: [shopifyClientId, shopifyClientSecret], timeoutSeconds: 120 },
  async (request: CallableRequest<{ address?: string }>) => {
    const uid = requireUid(request);
    const { shop, token } = await accessTokenFor(uid);
    await consumeQuota(uid, "audit", DAILY_AUDITS_PER_USER);
    try {
      await consumeQuota(`shop_${shop}`, "audit", DAILY_AUDITS_PER_SHOP);
    } catch (err) {
      await refundQuota(uid, "audit");
      throw err;
    }

    try {
      const snapshot = await collectSnapshot((query, variables) => adminGraphql(shop, token, query, variables), {
        profileAddress: String(request.data?.address ?? "").slice(0, 300),
      });
      return runAudit(snapshot);
    } catch (err) {
      await refundQuota(uid, "audit");
      await refundQuota(`shop_${shop}`, "audit");
      if (err instanceof HttpsError) throw err;
      // Pas de données de la boutique dans les journaux : seulement le message d'erreur.
      logger.error("Audit Shopify impossible", { message: err instanceof Error ? err.message : String(err) });
      throw new HttpsError("internal", "Impossible de lire les informations de la boutique. Réessaie plus tard.");
    }
  }
);

interface PublishRequest {
  policies: Partial<Record<PolicyType, string>>;
}

function toHtml(text: string): string {
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map(escape);
      // Une ligne seule et courte en tête de bloc est traitée comme un titre.
      if (lines.length > 1 && lines[0].length < 80 && !/[.:;]$/.test(lines[0])) {
        return `<h3>${lines[0]}</h3>\n<p>${lines.slice(1).join("<br>")}</p>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("\n");
}

/** Publie les pages légales générées dans les politiques de la boutique Shopify. */
export const htpShopifyPublishLegal = onCall(
  { region: REGION, secrets: [shopifyClientId, shopifyClientSecret] },
  async (request: CallableRequest<PublishRequest>) => {
    const uid = requireUid(request);
    const input = request.data?.policies ?? {};
    const entries = POLICY_TYPES.filter((t) => typeof input[t] === "string" && input[t]!.trim()).map(
      (t) => [t, input[t]!.slice(0, 60000)] as const
    );
    if (!entries.length) throw new HttpsError("invalid-argument", "Aucune page à publier.");

    const stored = (await shopRef(uid).get()).data() as StoredShop | undefined;
    if (stored && !canPublish(stored.scope)) {
      throw new HttpsError(
        "failed-precondition",
        "Ta boutique est connectée en lecture seule. Autorise la publication des politiques pour continuer."
      );
    }
    const { shop, token } = await accessTokenFor(uid);
    const results: { type: PolicyType; ok: boolean; url?: string; error?: string }[] = [];
    for (const [type, body] of entries) {
      const res = await adminGraphql<{
        shopPolicyUpdate: { shopPolicy: { url: string } | null; userErrors: { message: string }[] };
      }>(
        shop,
        token,
        `mutation HtpPolicy($shopPolicy: ShopPolicyInput!) {
          shopPolicyUpdate(shopPolicy: $shopPolicy) {
            shopPolicy { url }
            userErrors { message }
          }
        }`,
        { shopPolicy: { type, body: toHtml(body) } }
      );
      const payload = res.data?.shopPolicyUpdate;
      const error = res.errors?.[0]?.message ?? payload?.userErrors?.[0]?.message;
      results.push(error || !payload?.shopPolicy ? { type, ok: false, error: error ?? "Erreur inconnue" } : { type, ok: true, url: payload.shopPolicy.url });
    }
    return { results };
  }
);
