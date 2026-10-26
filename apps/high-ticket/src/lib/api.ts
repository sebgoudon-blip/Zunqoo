import type { Profile } from "../types";
import type { AuditReport, FixKind } from "./audit";
import { cloudEnabled } from "./cloudConfig";

function callable<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    if (!cloudEnabled) throw new Error("Le mode cloud n'est pas activé.");
    const { callFunction } = await import("./firebase");
    return callFunction<Req, Res>(name, data);
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const askCoach = callable<
  {
    task: { id: string; title: string; why: string; steps: string[] };
    profile: string;
    history: ChatMessage[];
    question: string;
  },
  { answer: string; remaining: number }
>("htpAskCoach");

export interface LegalIssue {
  document: string;
  severity: "bloquant" | "important" | "conseil";
  problem: string;
  suggestion: string;
}

export interface LegalReview {
  summary: string;
  issues: LegalIssue[];
  remaining: number;
}

export const reviewLegal = callable<
  { country: string; profile: string; documents: { title: string; body: string }[] },
  LegalReview
>("htpReviewLegal");

export type PolicyType =
  | "LEGAL_NOTICE"
  | "TERMS_OF_SERVICE"
  | "REFUND_POLICY"
  | "SHIPPING_POLICY"
  | "PRIVACY_POLICY"
  | "CONTACT_INFORMATION";

/** access « fix » : demande aussi les droits d'écriture des corrections (sinon lecture seule). */
export const startShopifyConnect = callable<{ shop: string; access?: "read" | "fix" }, { url: string }>("htpShopifyStart");
export const disconnectShopify = callable<Record<string, never>, { ok: boolean }>("htpShopifyDisconnect");

export type { AuditReport };

/** Un rapport enregistré par une version précédente de l'app est ignoré. */
export const isCurrentReport = (value: unknown): value is AuditReport =>
  !!value && typeof value === "object" && (value as { version?: unknown }).version === 2;

export const auditShop = callable<{ address?: string }, AuditReport>("htpShopifyAudit");

export interface ProposedChange {
  kind: FixKind;
  /** Produit ou page ; null pour une page Contact à créer. */
  id: string | null;
  label: string;
  before: string;
  after: string;
}

export interface ApplyResult {
  id: string | null;
  ok: boolean;
  changeId?: string;
  error?: string;
}

export const fixPreview = callable<{ kind: FixKind; ids?: string[] }, { changes: ProposedChange[] }>("htpFixPreview");
export const fixApply = callable<{ changes: ProposedChange[] }, { results: ApplyResult[] }>("htpFixApply");
export const fixUndo = callable<{ changeId: string }, { ok: boolean }>("htpFixUndo");

export const publishLegal = callable<
  { policies: Partial<Record<PolicyType, string>> },
  { results: { type: PolicyType; ok: boolean; url?: string; error?: string }[] }
>("htpShopifyPublishLegal");

/** Résumé du profil transmis à l'IA (sans téléphone ni email personnels). */
export function profileSummary(p: Profile | null): string {
  if (!p) return "Profil non renseigné.";
  return [
    `Pays du siège : ${p.country}`,
    `Structure : ${p.hasCompany ? `déjà créée (${p.legalForm || "forme non précisée"})` : "pas encore créée"}`,
    `Budget de départ : ${p.budget} €`,
    `Type d'adresse du siège : ${p.addressType}`,
    p.companyName && `Raison sociale : ${p.companyName}`,
    p.storeName && `Boutique : ${p.storeName}${p.storeUrl ? ` (${p.storeUrl})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}
