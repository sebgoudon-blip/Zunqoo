import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { startSync, type ShopifyLink, type SyncStatus } from "./lib/cloudSync";
import { auth, cloudEnabled } from "./lib/firebase";
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

function requireAuth() {
  if (!auth) throw new Error("Le mode cloud n'est pas configuré.");
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(cloudEnabled ? undefined : null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [shopify, setShopify] = useState<ShopifyLink | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) {
      setSyncStatus("idle");
      setShopify(null);
      return;
    }
    return startSync(user.uid, setSyncStatus, setShopify);
  }, [user]);

  const value: AuthState = {
    cloudEnabled,
    user,
    syncStatus,
    shopify,
    async signInWithGoogle() {
      await signInWithPopup(requireAuth(), new GoogleAuthProvider());
    },
    async signInWithEmail(email, password) {
      await signInWithEmailAndPassword(requireAuth(), email, password);
    },
    async signUpWithEmail(email, password) {
      await createUserWithEmailAndPassword(requireAuth(), email, password);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(requireAuth(), email);
    },
    async signOut() {
      await fbSignOut(requireAuth());
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
