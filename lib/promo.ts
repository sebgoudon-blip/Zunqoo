import crypto from "crypto";

// Genere un code promo court, lisible, sans caracteres ambigus (0/O, 1/I).
export function genererCodePromo(prefixe = "MERCI"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffixe = "";
  const octets = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    suffixe += alphabet[octets[i] % alphabet.length];
  }
  return `${prefixe}-${suffixe}`;
}
