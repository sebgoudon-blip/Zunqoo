import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { REGION, requireUid } from "./common";

const shopifyClientId = defineSecret("SHOPIFY_CLIENT_ID");
const shopifyClientSecret = defineSecret("SHOPIFY_CLIENT_SECRET");
/** URL publique de l'app HighTicket Pilot, par exemple https://hightiket.web.app (sans / final). */
const appUrl = defineString("HTP_APP_URL");

const API_VERSION = "2026-10";
const SCOPES = "read_products,read_content,write_legal_policies";
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const STATE_TTL_MS = 10 * 60 * 1000;

const db = () => getFirestore();
const callbackUrl = () => `${appUrl.value()}/api/shopify/callback`;

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
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
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
  errors?: { message: string }[];
}

async function adminGraphql<T>(shop: string, token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
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
  async (request: CallableRequest<{ shop: string }>) => {
    const uid = requireUid(request);
    const shop = normalizeShop(request.data?.shop);
    const state = randomBytes(24).toString("hex");
    await db().collection("htpOAuthStates").doc(state).set({ uid, shop, createdAt: FieldValue.serverTimestamp() });
    const params = new URLSearchParams({
      client_id: shopifyClientId.value(),
      scope: SCOPES,
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
      await publicRef(saved.uid).set({ shopify: { shop, connectedAt: FieldValue.serverTimestamp() } }, { merge: true });
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

const POLICY_LABELS: Record<PolicyType, string> = {
  LEGAL_NOTICE: "Mentions légales",
  TERMS_OF_SERVICE: "Conditions générales de vente",
  REFUND_POLICY: "Politique de retour et de remboursement",
  SHIPPING_POLICY: "Politique d'expédition",
  PRIVACY_POLICY: "Politique de confidentialité",
  CONTACT_INFORMATION: "Coordonnées",
};

interface AuditData {
  shop: {
    name: string;
    contactEmail: string;
    myshopifyDomain: string;
    primaryDomain: { host: string; url: string; sslEnabled: boolean };
    shopAddress: { formatted: string[] };
    shopPolicies: { type: PolicyType; body: string; url: string }[];
  };
  productsCount: { count: number } | null;
}

type CheckStatus = "ok" | "ko" | "unknown";

/** Vérifie automatiquement ce qui peut l'être dans la checklist Merchant Center. */
export const htpShopifyAudit = onCall(
  { region: REGION, secrets: [shopifyClientId, shopifyClientSecret] },
  async (request: CallableRequest<{ address?: string }>) => {
    const uid = requireUid(request);
    const { shop, token } = await accessTokenFor(uid);

    const main = await adminGraphql<AuditData>(
      shop,
      token,
      `query HtpAudit {
        shop {
          name
          contactEmail
          myshopifyDomain
          primaryDomain { host url sslEnabled }
          shopAddress { formatted }
          shopPolicies { type body url }
        }
        productsCount { count }
      }`
    );
    if (!main.data) {
      logger.error("Audit Shopify : réponse sans données", main.errors);
      throw new HttpsError("internal", "Impossible de lire les informations de la boutique.");
    }
    // Requête séparée : si ce champ n'est pas accessible, le reste de l'audit reste valable.
    const password = await adminGraphql<{ onlineStore: { passwordProtection: { enabled: boolean } } }>(
      shop,
      token,
      `query HtpPassword { onlineStore { passwordProtection { enabled } } }`
    ).catch(() => null);

    const s = main.data.shop;
    const policies = new Map(s.shopPolicies.filter((p) => p.body?.trim()).map((p) => [p.type, p]));
    const checks: { id: string; label: string; status: CheckStatus; detail: string }[] = [];
    const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });

    const ownDomain = s.primaryDomain.host !== s.myshopifyDomain && !s.primaryDomain.host.endsWith(".myshopify.com");
    add("domain", "Nom de domaine propre", ownDomain ? "ok" : "ko", ownDomain ? s.primaryDomain.host : "Le domaine principal est encore en .myshopify.com.");
    add("ssl", "HTTPS actif", s.primaryDomain.sslEnabled ? "ok" : "ko", s.primaryDomain.url);

    const pwd = password?.data?.onlineStore?.passwordProtection;
    add(
      "password",
      "Boutique ouverte au public",
      pwd ? (pwd.enabled ? "ko" : "ok") : "unknown",
      pwd ? (pwd.enabled ? "La boutique est encore protégée par mot de passe." : "Pas de mot de passe.") : "Vérifie dans Boutique en ligne > Préférences."
    );
    add("email", "Email de contact renseigné", s.contactEmail ? "ok" : "ko", s.contactEmail || "Paramètres > Général.");

    const count = main.data.productsCount?.count ?? 0;
    add("products", "Au moins un produit", count > 0 ? "ok" : "ko", `${count} produit(s).`);

    for (const type of POLICY_TYPES) {
      const p = policies.get(type);
      add(`policy_${type}`, POLICY_LABELS[type], p ? "ok" : "ko", p ? p.url : "Non publiée.");
    }

    const profileAddress = String(request.data?.address ?? "").toLowerCase();
    const zip = s.shopAddress.formatted.join(" ").match(/\b\d{4,5}\b/)?.[0];
    if (profileAddress && zip) {
      const same = profileAddress.includes(zip);
      add(
        "address",
        "Adresse identique au profil",
        same ? "ok" : "ko",
        same ? s.shopAddress.formatted.join(", ") : `Shopify : ${s.shopAddress.formatted.join(", ")}`
      );
    } else {
      add("address", "Adresse identique au profil", "unknown", "Renseigne l'adresse dans ton profil et dans Shopify.");
    }

    return { shop: s.name, domain: s.primaryDomain.host, checks, checkedAt: Date.now() };
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
