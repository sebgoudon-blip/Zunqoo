const TIMEZONE = "Europe/Paris";

/**
 * Journée d'événement au format YYYY-MM-DD (fuseau du commerçant). Doit
 * rester cohérent avec firebase/functions/src/orderStatus.ts, qui calcule
 * la même clé côté serveur pour l'attribution des numéros.
 */
export function todayDayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}
