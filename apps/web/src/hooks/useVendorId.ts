import { useEffect, useState } from "react";

const STORAGE_KEY = "zunqoo_vendor_id";

/**
 * Identifie le vendeur (foodtruck) auquel cet appareil est rattaché.
 * Résolu dans l'ordre : paramètre d'URL ?v=... (pratique pour épingler un
 * favori sur la tablette caisse ou la TV), puis stockage local, sinon vide
 * (l'écran de configuration s'affiche).
 *
 * Volontairement pas un compte utilisateur : juste un code d'établissement
 * saisi une fois sur l'appareil dédié.
 */
export function useVendorId(): [string, (vendorId: string) => void] {
  const [vendorId, setVendorIdState] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("v");
    if (fromUrl) return fromUrl.trim();
    return localStorage.getItem(STORAGE_KEY) ?? "";
  });

  useEffect(() => {
    if (vendorId) {
      localStorage.setItem(STORAGE_KEY, vendorId);
    }
  }, [vendorId]);

  function setVendorId(next: string) {
    setVendorIdState(next.trim());
  }

  return [vendorId, setVendorId];
}
