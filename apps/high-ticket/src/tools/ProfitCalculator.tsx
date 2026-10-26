import { computeProfit, eur, num, type ProfitInput } from "../lib/calc";
import { NumberField, Stat } from "./NumberField";
import { useProfitInput } from "./useProfitInput";

export function ProfitCalculator() {
  const [input, setInput] = useProfitInput();
  const r = computeProfit(input);
  const set = (key: keyof ProfitInput) => (v: number) => setInput((prev) => ({ ...prev, [key]: v }));

  const marginTone = r.marginRate >= 0.4 ? "good" : r.marginRate >= 0.25 ? "warn" : "bad";
  const roasTone = r.breakEvenRoas <= 3 ? "good" : r.breakEvenRoas <= 4 ? "warn" : "bad";

  return (
    <div className="tool-grid">
      <div className="card">
        <h3>Ton produit</h3>
        <NumberField label="Prix de vente TTC" value={input.priceTtc} onChange={set("priceTtc")} suffix="€" />
        <NumberField label="Taux de TVA" value={input.vatRate} onChange={set("vatRate")} suffix="%" step={0.1} hint="Mets 0 si tu es en franchise de TVA." />
        <NumberField label="Coût d'achat du produit" value={input.productCost} onChange={set("productCost")} suffix="€" />
        <NumberField label="Coût de livraison au client" value={input.shippingCost} onChange={set("shippingCost")} suffix="€" />
        <div className="grid-2">
          <NumberField label="Frais de paiement" value={input.paymentPercent} onChange={set("paymentPercent")} suffix="%" step={0.1} />
          <NumberField label="+ fixe par transaction" value={input.paymentFixed} onChange={set("paymentFixed")} suffix="€" step={0.05} />
        </div>
        <NumberField
          label="Provision retours / SAV"
          value={input.returnsPercent}
          onChange={set("returnsPercent")}
          suffix="%"
          hint="Une réserve pour les retours et la casse : 3 à 8 % selon le produit."
        />
      </div>

      <div className="card results">
        <h3>Résultat par vente</h3>
        <dl className="breakdown">
          <dt>Prix TTC</dt>
          <dd>{eur(input.priceTtc, 2)}</dd>
          <dt>TVA collectée</dt>
          <dd>− {eur(r.vat, 2)}</dd>
          <dt>Produit + livraison</dt>
          <dd>− {eur(input.productCost + input.shippingCost, 2)}</dd>
          <dt>Frais de paiement</dt>
          <dd>− {eur(r.paymentFees, 2)}</dd>
          <dt>Provision retours</dt>
          <dd>− {eur(r.returnsReserve, 2)}</dd>
        </dl>
        <div className="stats">
          <Stat label="Marge avant pub = CPA max" value={eur(r.marginBeforeAds)} tone={r.marginBeforeAds > 0 ? marginTone : "bad"} />
          <Stat label="Taux de marge (sur HT)" value={`${num(r.marginRate * 100, 0)} %`} tone={marginTone} />
          <Stat label="ROAS de rentabilité" value={num(r.breakEvenRoas, 2)} tone={roasTone} />
        </div>
        <p className="verdict">
          {r.marginBeforeAds <= 0
            ? "❌ Tu perds de l'argent avant même la publicité. Augmente le prix ou baisse les coûts."
            : roasTone === "good"
              ? `✅ Viable : chaque vente peut absorber jusqu'à ${eur(r.marginBeforeAds)} de publicité. Chaque euro de pub doit rapporter au moins ${num(r.breakEvenRoas, 2)} € de chiffre d'affaires.`
              : roasTone === "warn"
                ? "⚠️ Jouable, mais serré pour un démarrage. Cherche +5 à 10 points de marge."
                : "❌ ROAS de rentabilité trop élevé pour Google Shopping au démarrage. Revois le prix ou le produit."}
        </p>
      </div>
    </div>
  );
}
