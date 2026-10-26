import { useEffect, useState } from "react";

const PREFIX = "htp_";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * État React persisté dans le navigateur. Pour la V1 il n'y a pas de compte :
 * la progression de chaque utilisateur vit sur son appareil. Les erreurs de
 * stockage (navigation privée, quota) sont ignorées, l'app reste utilisable.
 */
export function useStoredState<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Stockage indisponible : on garde l'état en mémoire.
    }
  }, [key, value]);

  return [value, setValue];
}

export function clearStoredState() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Rien à faire.
  }
}
