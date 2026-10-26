export interface DayEntry {
  date: string;
  spend: number;
  clicks: number;
  sales: number;
  revenue: number;
}

export interface TrackerSummary {
  days: number;
  spend: number;
  clicks: number;
  sales: number;
  revenue: number;
  roas: number;
  cpa: number;
  /** Dépense cumulée depuis la dernière vente (ou depuis le début s'il n'y en a pas). */
  spendSinceLastSale: number;
}

export const sortEntries = (entries: DayEntry[]) => [...entries].sort((a, b) => a.date.localeCompare(b.date));

export function summarize(entries: DayEntry[]): TrackerSummary {
  const sorted = sortEntries(entries);
  const sum = (k: keyof Omit<DayEntry, "date">) => sorted.reduce((t, e) => t + (e[k] || 0), 0);
  const spend = sum("spend");
  const sales = sum("sales");
  const revenue = sum("revenue");
  let spendSinceLastSale = 0;
  for (const e of sorted) spendSinceLastSale = e.sales > 0 ? 0 : spendSinceLastSale + (e.spend || 0);
  return {
    days: sorted.length,
    spend,
    clicks: sum("clicks"),
    sales,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    cpa: sales > 0 ? spend / sales : Infinity,
    spendSinceLastSale,
  };
}

export interface Advice {
  tone: "good" | "warn" | "bad";
  message: string;
}

/** Applique la règle de la tâche 6.6 aux chiffres saisis. */
export function advise(s: TrackerSummary, cpaMax: number, breakEvenRoas: number): Advice {
  if (s.days === 0) return { tone: "warn", message: "Saisis tes chiffres chaque jour, depuis Google Ads." };
  if (cpaMax > 0 && s.spendSinceLastSale >= 2 * cpaMax) {
    return {
      tone: "bad",
      message: `Règle de coupe atteinte : ${Math.round(s.spendSinceLastSale)} € dépensés sans vente, soit plus de 2 × ton CPA max. Baisse l'enchère de 30 % ou mets le produit en pause.`,
    };
  }
  if (s.days < 3) return { tone: "warn", message: "Moins de 3 jours de données : ne modifie rien sauf problème technique." };
  if (s.sales === 0) return { tone: "warn", message: "Pas encore de vente, mais la règle de coupe n'est pas atteinte : laisse tourner." };
  if (s.roas >= breakEvenRoas) {
    return { tone: "good", message: "Campagne rentable : ROAS au-dessus de ton seuil. Ne change rien, puis augmente le budget par paliers de 20 %." };
  }
  return {
    tone: "warn",
    message: "Des ventes, mais un ROAS sous ton seuil : exclus les termes non pertinents, baisse l'enchère des produits les moins rentables, et réévalue dans 7 jours.",
  };
}
