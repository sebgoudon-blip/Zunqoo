import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export const REGION = "europe-west1";

export function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Connecte-toi pour utiliser cette fonctionnalité.");
  }
  return uid;
}

const usageRef = (key: string) =>
  getFirestore().collection("htpUsage").doc(`${key}_${new Date().toISOString().slice(0, 10)}`);

/**
 * Décrémente un quota journalier (par utilisateur, ou par boutique) ; lève une
 * erreur s'il est épuisé. Renvoie le nombre d'utilisations restantes.
 */
export async function consumeQuota(key: string, kind: string, limit: number): Promise<number> {
  const ref = usageRef(key);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()?.[kind] as number) : 0) ?? 0;
    if (used >= limit) {
      throw new HttpsError("resource-exhausted", "Limite quotidienne atteinte. Elle se réinitialise demain.");
    }
    tx.set(ref, { [kind]: FieldValue.increment(1), key, day: ref.id.slice(-10) }, { merge: true });
    return limit - used - 1;
  });
}

export async function refundQuota(key: string, kind: string) {
  await usageRef(key)
    .set({ [kind]: FieldValue.increment(-1) }, { merge: true })
    .catch(() => undefined);
}
