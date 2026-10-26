import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export const REGION = "europe-west1";

export function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Connecte-toi pour utiliser cette fonctionnalité.");
  }
  return uid;
}
