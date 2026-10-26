import { Link } from "react-router-dom";
import { useStoredState } from "../hooks/useStoredState";
import { computeAds, computeProfit, eur, num } from "../lib/calc";
import { useAppState } from "../state";
import { Verdict } from "../components/Icon";
import { NumberField, Stat } from "./NumberField";
import { useProfitInput } from "./useProfitInput";

interface AdsSettings {
  adBudget: number;
  days: number;
  cpc: number;
  conversionRate: number;
}

export function AdsPlanner() {
  const { profile } = useAppState();
  const [profitInput] = useProfitInput();
  const profit = computeProfit(profitInput);
  const [s, setS] = useStoredState<AdsSettings>("ads_settings", {
    adBudget: Math.round(((profile?.budget ?? 1000) * 0.65) / 10) * 10,
    days: 30,
    cpc: 1,
    conversionRate: 0.8,
  });
  const set = (key: keyof AdsSettings) => (v: number) => setS((prev) => ({ ...prev, [key]: v }));

  const r = computeAds({ ...s, priceTtc: profitInput.priceTtc, marginBeforeAds: profit.marginBeforeAds });
  const profitable = r.roas >= profit.breakEvenRoas;

  return (
    <div className="tool-grid">
      <div className="card">
        <h3>Hypothèses</h3>
        <p className="muted">
          Prix ({eur(profitInput.priceTtc)}) et CPA max ({eur(profit.marginBeforeAds)}) viennent du{" "}
          <Link to="/outils/profit">calculateur de rentabilité</Link>.
        </p>
        <NumberField
          label="Budget publicitaire de la période"
          value={s.adBudget}
          onChange={set("adBudget")}
          suffix="€"
          hint="Sur un budget total de 1 000 €, prévois environ 600 à 700 € de publicité."
        />
        <NumberField label="Durée" value={s.days} onChange={set("days")} suffix="jours" />
        <NumberField
          label="CPC moyen estimé"
          value={s.cpc}
          onChange={set("cpc")}
          suffix="€"
          step={0.05}
          hint="Repris du Planificateur de mots-clés (tâche 2.3). Le Shopping est souvent moins cher que le Search."
        />
        <NumberField
          label="Taux de conversion"
          value={s.conversionRate}
          onChange={set("conversionRate")}
          suffix="%"
          step={0.1}
          hint="Hypothèse prudente pour du high-ticket : 0,5 à 1,5 %."
        />
      </div>

      <div className="card results">
        <h3>Projection</h3>
        <div className="stats">
          <Stat label="Budget quotidien" value={eur(r.dailyBudget, 2)} />
          <Stat label="Clics attendus" value={num(r.clicks, 0)} />
          <Stat label="Ventes attendues" value={num(r.sales, 1)} />
          <Stat label="Chiffre d'affaires" value={eur(r.revenue)} />
          <Stat label="Coût par vente (CPA)" value={eur(r.cpa)} tone={r.cpa <= profit.marginBeforeAds ? "good" : "bad"} />
          <Stat label="ROAS projeté" value={num(r.roas, 2)} tone={profitable ? "good" : "bad"} />
          <Stat label="Profit après pub" value={eur(r.profit)} tone={r.profit >= 0 ? "good" : "bad"} />
        </div>
        <div className="why">
          <strong>Ta règle de coupe</strong>
          <p>
            Si un produit atteint environ <b>{r.killClicks} clics</b> (≈ {eur(2 * Math.max(profit.marginBeforeAds, 0))}{" "}
            dépensés, soit 2 × ton CPA max) sans aucune vente : baisse son enchère de 30 % ou mets-le en pause.
          </p>
        </div>
        {profitable ? (
          <Verdict tone="good">Avec ces hypothèses, la campagne est rentable. Vérifie-les avec tes vrais chiffres après 7 jours.</Verdict>
        ) : (
          <Verdict tone="warn">
            Il faudrait un ROAS d'au moins {num(profit.breakEvenRoas, 2)}. Joue sur le CPC (meilleur flux, négatifs), le
            taux de conversion (fiche produit) ou la marge.
          </Verdict>
        )}
      </div>
    </div>
  );
}
