/**
 * Configuration du mode cloud, sans dépendance à Firebase : le SDK n'est
 * chargé (import dynamique de ./firebase) que si le mode cloud est actif.
 */

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Verrou de lancement : tant qu'il vaut false, l'app reste en mode local même
// si une configuration Firebase est présente (aucun compte, aucun appel à
// Firebase, à l'IA ou à Shopify). À passer à true uniquement au lancement.
const CLOUD_LAUNCHED = false;

/** Sans configuration Firebase (ou verrou actif), l'app fonctionne en mode local. */
export const cloudEnabled = CLOUD_LAUNCHED && Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/** Message lisible à partir d'une erreur de Cloud Function. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message.replace(/^.*?:\s*/, "") || "Une erreur est survenue.";
  }
  return "Une erreur est survenue.";
}
