const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuro(value: number | null | undefined): string {
  return value == null ? "—" : euro.format(value);
}

export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const m = phone.match(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** « aujourd'hui 14:05 », « hier 09:30 », « 12 oct. 18:00 ». */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? "aujourd'hui" : same(d, yesterday) ? "hier" : dayFmt.format(d);
  return `${day} ${timeFmt.format(d)}`;
}

/** Saisie française « 12,50 » -> 12.5 ; vide -> null ; illisible -> NaN. */
export function parseEuroInput(text: string): number | null {
  const t = text.replace(/\s|€/g, "").replace(",", ".");
  if (!t) return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
