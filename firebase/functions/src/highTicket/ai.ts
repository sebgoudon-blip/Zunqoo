import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { REGION, requireUid } from "./common";

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-5-5";
const DAILY_QUESTIONS = 30;
const DAILY_LEGAL_REVIEWS = 5;

const COACH_SYSTEM = `Tu es le coach de HighTicket Pilot, une plateforme qui guide des entrepreneurs francophones débutants pour lancer une boutique e-commerce high-ticket (produits de 300 à 2 000 €) sur Shopify, avec Google Shopping et Google Ads comme canal d'acquisition, souvent avec un budget de départ d'environ 1 000 €.

L'utilisateur suit un parcours en micro-tâches. On te donne la tâche en cours, son profil et sa question.

Comment répondre :
- En français, en tutoyant, avec un ton direct et bienveillant.
- Réponds d'abord à la question posée, de façon concrète et actionnable : étapes, chiffres, exemples. Reste court (en général moins de 200 mots) sauf si la question demande vraiment du détail.
- Reste dans le périmètre : e-commerce, Shopify, Google Merchant Center, Google Ads, sourcing, logistique, conformité de la vente en ligne. Si la question sort de ce cadre, dis-le simplement et ramène vers la tâche.
- Privilégie toujours les options gratuites ou les moins chères, adaptées au budget de l'utilisateur.
- Sois honnête sur l'incertitude : les prix, offres et règles des plateformes changent souvent. Quand un chiffre ou une règle peut avoir évolué, dis-le et indique où vérifier (aide Shopify, aide Google Merchant Center, administration fiscale).
- Pour le juridique et la fiscalité, donne le cadre général et les bons réflexes, et recommande un professionnel (expert-comptable, avocat) pour la décision finale. N'invente jamais d'article de loi ni de chiffre précis dont tu n'es pas sûr.
- Ne recommande jamais de pratiques trompeuses (faux avis, faux stocks, fausses promotions, contrefaçon) : elles font suspendre les comptes Merchant Center.
- Termine, si c'est utile, par la prochaine action concrète pour avancer sur la tâche.
- Mise en forme : texte simple, listes courtes si besoin, pas de titres.`;

const LEGAL_SYSTEM = `Tu relis les pages légales d'une boutique e-commerce B2C (mentions légales, CGV, politique de retour, de livraison, de confidentialité) générées à partir de modèles par HighTicket Pilot.

Ton objectif : repérer ce qui manque, ce qui est incohérent entre les pages ou avec le profil de l'entreprise, et ce qui risque de poser problème lors de la revue Google Merchant Center ou au regard des obligations usuelles de la vente à distance dans le pays du vendeur (France, Belgique, Luxembourg ou Suisse).

Règles :
- Les champs entre [crochets] sont des informations non renseignées : signale chacun d'eux.
- Vérifie la cohérence : délais de retour et de livraison identiques partout, même adresse, même email, même raison sociale.
- Signale les mentions habituellement attendues qui manquent (par exemple médiateur de la consommation en France, droit de rétractation de 14 jours dans l'UE, garantie légale de conformité, identité complète de l'éditeur).
- Sois factuel et prudent : tu fais une relecture de premier niveau, pas un avis juridique. N'invente pas de références d'articles de loi.
- Rédige en français, en tutoyant, avec des messages courts et une suggestion concrète de correction pour chaque point.
- Classe chaque point : "bloquant" (risque de refus Merchant Center ou manquement clair), "important" (à corriger avant de lancer la publicité), "conseil" (amélioration).`;

const LEGAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "issues"],
  properties: {
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["document", "severity", "problem", "suggestion"],
        properties: {
          document: { type: "string" },
          severity: { type: "string", enum: ["bloquant", "important", "conseil"] },
          problem: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: anthropicKey.value() });
  return client;
}

/** Décrémente le quota journalier de l'utilisateur ; lève une erreur s'il est épuisé. */
async function consumeQuota(uid: string, kind: "ask" | "legal", limit: number): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getFirestore().collection("htpUsage").doc(`${uid}_${day}`);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()?.[kind] as number) : 0) ?? 0;
    if (used >= limit) {
      throw new HttpsError("resource-exhausted", "Limite quotidienne atteinte. Elle se réinitialise demain.");
    }
    tx.set(ref, { [kind]: FieldValue.increment(1), uid, day }, { merge: true });
    return limit - used - 1;
  });
}

async function refundQuota(uid: string, kind: "ask" | "legal") {
  const day = new Date().toISOString().slice(0, 10);
  await getFirestore()
    .collection("htpUsage")
    .doc(`${uid}_${day}`)
    .set({ [kind]: FieldValue.increment(-1) }, { merge: true })
    .catch(() => undefined);
}

function str(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field} est requis.`);
  }
  return value.slice(0, max);
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  if (message.stop_reason === "refusal") {
    throw new HttpsError("failed-precondition", "L'assistant ne peut pas répondre à cette demande. Reformule ta question.");
  }
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpsError("resource-exhausted", "L'assistant est très sollicité. Réessaie dans une minute.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new HttpsError("unavailable", "Impossible de joindre l'assistant. Réessaie dans un instant.");
  }
  if (err instanceof Anthropic.APIError) {
    logger.error("Erreur API Claude", { status: err.status, message: err.message });
    return new HttpsError("internal", "L'assistant a rencontré une erreur. Réessaie plus tard.");
  }
  logger.error("Erreur inattendue", err);
  return new HttpsError("internal", "Erreur inattendue.");
}

interface AskRequest {
  task: { id: string; title: string; why: string; steps: string[] };
  profile: string;
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}

/**
 * Répond à une question de l'utilisateur dans le contexte de la tâche en cours.
 * L'historique est envoyé par le client (il est stocké avec sa progression).
 */
export const htpAskCoach = onCall(
  { region: REGION, secrets: [anthropicKey], timeoutSeconds: 120 },
  async (request: CallableRequest<AskRequest>) => {
    const uid = requireUid(request);
    const data = request.data;
    const question = str(data?.question, 2000, "La question");
    const task = data?.task;
    if (!task || typeof task.title !== "string") {
      throw new HttpsError("invalid-argument", "La tâche est requise.");
    }

    const remaining = await consumeQuota(uid, "ask", DAILY_QUESTIONS);

    const context = [
      `Tâche en cours : ${task.id} – ${task.title}`,
      `Pourquoi : ${String(task.why ?? "").slice(0, 1000)}`,
      `Étapes :\n${(Array.isArray(task.steps) ? task.steps : []).slice(0, 12).map((s, i) => `${i + 1}. ${String(s).slice(0, 500)}`).join("\n")}`,
      `Profil de l'utilisateur :\n${String(data.profile ?? "").slice(0, 1500)}`,
    ].join("\n\n");

    const history = (Array.isArray(data.history) ? data.history : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      // Le contexte reste en tête de conversation pour que le préfixe soit stable d'une question à l'autre.
      { role: "user", content: `<contexte>\n${context}\n</contexte>` },
      ...history,
      { role: "user", content: question },
    ];

    try {
      const response = await anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: COACH_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages,
      });
      return { answer: textOf(response), remaining };
    } catch (err) {
      await refundQuota(uid, "ask");
      throw toHttpsError(err);
    }
  }
);

interface LegalRequest {
  country: string;
  profile: string;
  documents: { title: string; body: string }[];
}

/** Relecture de premier niveau des pages légales générées, avec une sortie structurée. */
export const htpReviewLegal = onCall(
  { region: REGION, secrets: [anthropicKey], timeoutSeconds: 300 },
  async (request: CallableRequest<LegalRequest>) => {
    const uid = requireUid(request);
    const docs = Array.isArray(request.data?.documents) ? request.data.documents.slice(0, 8) : [];
    if (!docs.length) throw new HttpsError("invalid-argument", "Aucun document à relire.");

    const remaining = await consumeQuota(uid, "legal", DAILY_LEGAL_REVIEWS);

    const content = [
      `Pays du siège : ${String(request.data.country ?? "").slice(0, 10)}`,
      `Profil de l'entreprise :\n${String(request.data.profile ?? "").slice(0, 2000)}`,
      ...docs.map((d) => `<document titre="${String(d.title).slice(0, 100)}">\n${String(d.body).slice(0, 20000)}\n</document>`),
    ].join("\n\n");

    try {
      const response = await anthropic()
        .beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: LEGAL_SCHEMA },
          },
          system: [{ type: "text", text: LEGAL_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
        })
        .finalMessage();
      const parsed = JSON.parse(textOf(response));
      return { ...parsed, remaining };
    } catch (err) {
      await refundQuota(uid, "legal");
      if (err instanceof SyntaxError) {
        throw new HttpsError("internal", "La relecture n'a pas pu être analysée. Réessaie.");
      }
      throw toHttpsError(err);
    }
  }
);
