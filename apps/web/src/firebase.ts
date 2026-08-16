import { initializeApp } from "firebase/app";
import {
  enableIndexedDbPersistence,
  getFirestore,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Permet à la caisse et à l'écran d'affichage de continuer à fonctionner
// (lecture du cache local + écriture en attente) sur un réseau de festival
// dégradé ou coupé, avec resynchronisation automatique au retour du réseau.
enableIndexedDbPersistence(db).catch((err) => {
  // Échoue silencieusement si plusieurs onglets sont ouverts, ou si le
  // navigateur ne supporte pas IndexedDB : l'app reste fonctionnelle,
  // simplement sans persistance hors-ligne.
  console.warn("Persistance hors-ligne Firestore indisponible :", err.code);
});

const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1"
);

export interface CreateOrderResponse {
  orderId: string;
  number: number;
}

export const createOrderCallable = httpsCallable<
  { vendorId: string; source: "client" | "cashier"; fcmToken?: string | null },
  CreateOrderResponse
>(functions, "createOrder");
