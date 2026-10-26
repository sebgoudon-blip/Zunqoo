import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ShopifyLink, SyncStatus } from "./lib/cloudSync";
import { cloudEnabled } from "./lib/cloudConfig";
import { clearAll } from "./lib/store";

interface AuthState {
  cloudEnabled: boolean;
  /** undefined tant que Firebase n'a pas restauré la session. */
  user: User | null | undefined;
  syncStatus: SyncStatus;
  shopify: ShopifyLink | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Charge le SDK Firebase uniquement quand le mode cloud est actif. */
async function sdk() {
  if (!cloudEnabled) throw new Error("Le mode cloud n'est pas activé.");
  const [firebase, fbAuth] = await Promise.all([import("./lib/firebase"), import("firebase/auth")]);
  return { auth: firebase.auth, db: firebase.db, fbAuth };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(cloudEnabled ? undefined : null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [shopify, setShopify] = useState<ShopifyLink | null>(null);

  useEffect(() => {
    if (!cloudEnabled) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void sdk().then(({ auth, fbAuth }) => {
      if (!cancelled) unsubscribe = fbAuth.onAuthStateChanged(auth, setUser);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setSyncStatus("idle");
      setShopify(null);
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([sdk(), import("./lib/cloudSync")]).then(([{ db }, sync]) => {
      if (!cancelled) stop = sync.startSync(db, user.uid, setSyncStatus, setShopify);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [user]);

  const value: AuthState = {
    cloudEnabled,
    user,
    syncStatus,
    shopify,
    async signInWithGoogle() {
      const { auth, fbAuth } = await sdk();
      await fbAuth.signInWithPopup(auth, new fbAuth.GoogleAuthProvider());
    },
    async signInWithEmail(email, password) {
      const { auth, fbAuth } = await sdk();
      await fbAuth.signInWithEmailAndPassword(auth, email, password);
    },
    async signUpWithEmail(email, password) {
      const { auth, fbAuth } = await sdk();
      await fbAuth.createUserWithEmailAndPassword(auth, email, password);
    },
    async resetPassword(email) {
      const { auth, fbAuth } = await sdk();
      await fbAuth.sendPasswordResetEmail(auth, email);
    },
    async signOut() {
      const { auth, fbAuth } = await sdk();
      await fbAuth.signOut(auth);
      // Les données restent dans le compte : on vide l'appareil, qui peut être partagé.
      clearAll();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}

/** Traduit les codes d'erreur Firebase Auth les plus courants. */
export function authErrorMessage(err: unknown): string {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/invalid-email": "Adresse email invalide.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email. Connecte-toi.",
    "auth/weak-password": "Mot de passe trop court : 8 caractères minimum.",
    "auth/popup-closed-by-user": "Connexion annulée.",
    "auth/popup-blocked": "Le navigateur a bloqué la fenêtre de connexion. Autorise les pop-ups et réessaie.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
    "auth/network-request-failed": "Pas de connexion internet.",
  };
  return messages[code] ?? "La connexion a échoué. Réessaie.";
}
