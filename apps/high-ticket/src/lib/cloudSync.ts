import { doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { applyRemote, localEntries, setChangeHook } from "./store";

interface RemoteEntry {
  v: string;
  t: number;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

const DEBOUNCE_MS = 800;

export interface ShopifyLink {
  shop: string;
  /** false : boutique connectée en lecture seule (publication des politiques non autorisée). */
  canPublish?: boolean;
}

/**
 * Synchronise le magasin local avec le document Firestore htpUsers/{uid}.
 * Chaque clé garde la version la plus récente (dernier écrivain gagnant),
 * ce qui permet de passer d'un appareil à l'autre sans perte.
 */
export function startSync(
  db: Firestore,
  uid: string,
  onStatus: (s: SyncStatus) => void,
  onShopify: (link: ShopifyLink | null) => void
): () => void {
  const ref = doc(db, "htpUsers", uid);
  const pending = new Map<string, RemoteEntry>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let initialized = false;

  function flush() {
    if (!pending.size) return;
    const state = Object.fromEntries(pending);
    pending.clear();
    onStatus("syncing");
    setDoc(ref, { state }, { merge: true })
      .then(() => onStatus("synced"))
      .catch(() => onStatus("error"));
  }

  function queue(key: string, json: string, updatedAt: number) {
    pending.set(key, { v: json, t: updatedAt });
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  setChangeHook((key, json, updatedAt) => {
    if (initialized) queue(key, json, updatedAt);
  });

  onStatus("syncing");
  const unsubscribe: Unsubscribe = onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      onShopify((data?.shopify as ShopifyLink | undefined) ?? null);
      const remote = (data?.state ?? {}) as Record<string, RemoteEntry>;
      for (const [key, entry] of Object.entries(remote)) {
        if (entry && typeof entry.v === "string") applyRemote(key, entry.v, entry.t);
      }
      if (!initialized) {
        initialized = true;
        // Envoie ce qui a été fait sur cet appareil avant la connexion.
        for (const { key, json, updatedAt } of localEntries()) {
          if (!remote[key] || remote[key].t < updatedAt) queue(key, json, updatedAt);
        }
        if (!pending.size) onStatus("synced");
      }
    },
    () => onStatus("error")
  );

  return () => {
    clearTimeout(timer);
    flush();
    setChangeHook(null);
    unsubscribe();
  };
}
