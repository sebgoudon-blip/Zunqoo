import { useStoredState } from "../hooks/useStoredState";
import type { ProfitInput } from "../lib/calc";
import { useAppState } from "../state";
import { STANDARD_VAT } from "./registry";

/** Saisie du calculateur de rentabilité, partagée avec le planificateur Google Ads. */
export function useProfitInput() {
  const { profile } = useAppState();
  return useStoredState<ProfitInput>("profit_input", {
    priceTtc: 749,
    vatRate: STANDARD_VAT[profile?.country ?? "FR"],
    productCost: 280,
    shippingCost: 35,
    paymentPercent: 1.9,
    paymentFixed: 0.25,
    returnsPercent: 5,
  });
}
