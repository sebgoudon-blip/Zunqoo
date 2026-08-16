/**
 * Le QR code collé sur le foodtruck est fixe et générique : il encode
 * uniquement l'identifiant du vendeur (ex. "zunqoo://scan?v=cocorico" ou
 * "https://app.zunqoo.com/scan?v=cocorico"), jamais un événement ou une
 * commande précise. Un seul autocollant suffit pour tous les événements
 * auxquels participe ce vendeur.
 *
 * Évite de dépendre de la classe URL (support inégal sur React Native) :
 * extraction du paramètre "v" par une simple expression régulière.
 */
export function parseVendorIdFromQr(raw: string): string | null {
  const match = raw.match(/[?&]v=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}
