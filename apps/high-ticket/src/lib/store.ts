/**
 * Magasin clé/valeur de l'app : persistance locale immédiate (localStorage),
 * horodatage par clé pour fusionner avec le cloud, et abonnements React.
 */

const PREFIX = "htp_";
const META_KEY = `${PREFIX}_meta`;

type Listener = () => void;
type ChangeHook = (key: string, json: string, updatedAt: number) => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
let meta: Record<string, number> = readMeta();
let onLocalChange: ChangeHook | null = null;

function readMeta(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function persist(key: string, json: string) {
  try {
    localStorage.setItem(PREFIX + key, json);
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Stockage indisponible (navigation privée, quota) : l'état reste en mémoire.
  }
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

export function getValue<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) {
      const value = JSON.parse(raw) as T;
      cache.set(key, value);
      return value;
    }
  } catch {
    // Valeur illisible : on repart du défaut.
  }
  return fallback;
}

export function setValue<T>(key: string, value: T) {
  const json = JSON.stringify(value);
  const updatedAt = Date.now();
  cache.set(key, value);
  meta[key] = updatedAt;
  persist(key, json);
  notify(key);
  onLocalChange?.(key, json, updatedAt);
}

/** Applique une valeur venue du cloud si elle est plus récente que la copie locale. */
export function applyRemote(key: string, json: string, updatedAt: number): boolean {
  if ((meta[key] ?? 0) >= updatedAt) return false;
  try {
    cache.set(key, JSON.parse(json));
  } catch {
    return false;
  }
  meta[key] = updatedAt;
  persist(key, json);
  notify(key);
  return true;
}

/** Toutes les clés locales avec leur horodatage, pour l'envoi initial vers le cloud. */
export function localEntries(): { key: string; json: string; updatedAt: number }[] {
  return Object.entries(meta).flatMap(([key, updatedAt]) => {
    try {
      const json = localStorage.getItem(PREFIX + key) ?? (cache.has(key) ? JSON.stringify(cache.get(key)) : null);
      return json === null ? [] : [{ key, json, updatedAt }];
    } catch {
      return cache.has(key) ? [{ key, json: JSON.stringify(cache.get(key)), updatedAt }] : [];
    }
  });
}

export function setChangeHook(hook: ChangeHook | null) {
  onLocalChange = hook;
}

export function subscribe(key: string, listener: Listener): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => listeners.get(key)?.delete(listener);
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Rien à faire.
  }
  const keys = [...cache.keys(), ...Object.keys(meta)];
  cache.clear();
  meta = {};
  new Set(keys).forEach(notify);
}

const BACKUP_APP = "highticket-pilot";

interface Backup {
  app: typeof BACKUP_APP;
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

/** Instantané de toutes les données de l'app, pour une sauvegarde dans un fichier. */
export function exportBackup(): Backup {
  const data: Record<string, unknown> = {};
  // Lecture directe du stockage : couvre aussi les données créées avant l'horodatage par clé.
  const keys = new Set(cache.keys());
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) && k !== META_KEY)
      .forEach((k) => keys.add(k.slice(PREFIX.length)));
  } catch {
    // Stockage indisponible : on exporte ce qui est en mémoire.
  }
  for (const key of keys) {
    const value = getValue<unknown>(key, undefined);
    if (value !== undefined) data[key] = value;
  }
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data };
}

/** Restaure une sauvegarde ; renvoie le nombre d'éléments restaurés. */
export function importBackup(raw: unknown): number {
  const backup = raw as Partial<Backup> | null;
  if (!backup || backup.app !== BACKUP_APP || typeof backup.data !== "object" || backup.data === null) {
    throw new Error("Ce fichier n'est pas une sauvegarde HighTicket Pilot.");
  }
  const entries = Object.entries(backup.data).filter(([key]) => /^[a-z_]+$/.test(key));
  for (const [key, value] of entries) setValue(key, value);
  return entries.length;
}
