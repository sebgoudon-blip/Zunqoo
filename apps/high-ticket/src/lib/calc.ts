export interface ProfitInput {
  /** Prix de vente affiché, TTC. */
  priceTtc: number;
  vatRate: number;
  productCost: number;
  shippingCost: number;
  /** Frais de paiement en pourcentage du prix TTC. */
  paymentPercent: number;
  paymentFixed: number;
  /** Provision pour retours, SAV et casse, en pourcentage du prix TTC. */
  returnsPercent: number;
}

export interface ProfitResult {
  priceHt: number;
  vat: number;
  paymentFees: number;
  returnsReserve: number;
  /** Ce qu'il reste par vente avant publicité : c'est le CPA maximal. */
  marginBeforeAds: number;
  marginRate: number;
  /** ROAS (valeur de conversion TTC / dépense) au-dessous duquel on perd de l'argent. */
  breakEvenRoas: number;
}

export function computeProfit(i: ProfitInput): ProfitResult {
  const priceHt = i.priceTtc / (1 + i.vatRate / 100);
  const vat = i.priceTtc - priceHt;
  const paymentFees = (i.priceTtc * i.paymentPercent) / 100 + i.paymentFixed;
  const returnsReserve = (i.priceTtc * i.returnsPercent) / 100;
  const marginBeforeAds = priceHt - i.productCost - i.shippingCost - paymentFees - returnsReserve;
  return {
    priceHt,
    vat,
    paymentFees,
    returnsReserve,
    marginBeforeAds,
    marginRate: priceHt > 0 ? marginBeforeAds / priceHt : 0,
    breakEvenRoas: marginBeforeAds > 0 ? i.priceTtc / marginBeforeAds : Infinity,
  };
}

export interface AdsInput {
  adBudget: number;
  days: number;
  cpc: number;
  /** Taux de conversion visite → achat, en pourcentage. */
  conversionRate: number;
  priceTtc: number;
  marginBeforeAds: number;
}

export interface AdsResult {
  dailyBudget: number;
  clicks: number;
  sales: number;
  revenue: number;
  cpa: number;
  roas: number;
  profit: number;
  /** Clics à atteindre sans vente avant de couper un produit (2 × CPA max). */
  killClicks: number;
}

export function computeAds(i: AdsInput): AdsResult {
  const clicks = i.cpc > 0 ? i.adBudget / i.cpc : 0;
  const sales = (clicks * i.conversionRate) / 100;
  const revenue = sales * i.priceTtc;
  return {
    dailyBudget: i.days > 0 ? i.adBudget / i.days : 0,
    clicks,
    sales,
    revenue,
    cpa: sales > 0 ? i.adBudget / sales : Infinity,
    roas: i.adBudget > 0 ? revenue / i.adBudget : 0,
    profit: sales * i.marginBeforeAds - i.adBudget,
    killClicks: i.cpc > 0 ? Math.ceil((2 * Math.max(i.marginBeforeAds, 0)) / i.cpc) : 0,
  };
}

export const eur = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "—";

export const num = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "∞";
