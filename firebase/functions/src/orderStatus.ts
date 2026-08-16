export type OrderStatus = "waiting" | "preparing" | "ready" | "delivered";

export type OrderSource = "client" | "cashier";

export const TIMEZONE = "Europe/Paris";

/**
 * Journée d'événement au format YYYY-MM-DD, dans le fuseau horaire du
 * commerçant. Sert de clé de session : le compteur de numéros repart de 1
 * à chaque nouvelle journée, sans action manuelle nécessaire.
 */
export function todayDayKey(timeZone: string = TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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
