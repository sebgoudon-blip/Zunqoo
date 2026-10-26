import { useCallback, useRef, useSyncExternalStore } from "react";
import { clearAll, getValue, setValue, subscribe } from "../lib/store";

/**
 * État React persisté : sur l'appareil, et dans le cloud quand l'utilisateur
 * est connecté (voir lib/cloudSync). Toutes les instances qui partagent une
 * clé restent synchronisées.
 */
export function useStoredState<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const fallbackRef = useRef(fallback);
  const value = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    () => getValue(key, fallbackRef.current)
  );

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = getValue(key, fallbackRef.current);
      setValue(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next);
    },
    [key]
  );

  return [value, set];
}

export function clearStoredState() {
  clearAll();
}
