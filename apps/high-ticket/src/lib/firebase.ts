import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Sans configuration Firebase, l'app fonctionne en mode local (sans compte,
 * sans assistant IA ni connexion Shopify).
 */
// Verrou de lancement : tant qu'il vaut false, l'app reste en mode local même
// si une configuration Firebase est présente (aucun compte, aucun appel à
// Firebase, à l'IA ou à Shopify). À passer à true uniquement au lancement.
const CLOUD_LAUNCHED = false;

export const cloudEnabled = CLOUD_LAUNCHED && Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

if (cloudEnabled) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1");
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
}

export { auth, db };

export function callable<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    if (!functions) throw new Error("Le mode cloud n'est pas configuré.");
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  };
}

/** Message lisible à partir d'une erreur de Cloud Function. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message.replace(/^.*?:\s*/, "") || "Une erreur est survenue.";
  }
  return "Une erreur est survenue.";
}
