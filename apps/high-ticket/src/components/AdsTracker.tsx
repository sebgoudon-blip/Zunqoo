import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useStoredState } from "../hooks/useStoredState";
import { computeProfit, eur, num } from "../lib/calc";
import { advise, sortEntries, summarize, type DayEntry } from "../lib/tracker";
import { useProfitInput } from "../tools/useProfitInput";
import { Icon, Verdict } from "./Icon";

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { spend: "", clicks: "", sales: "", revenue: "" };

export function AdsTracker() {
  const [entries, setEntries] = useStoredState<DayEntry[]>("ads_log", []);
  const [profitInput] = useProfitInput();
  const profit = computeProfit(profitInput);
  const [date, setDate] = useState(today);
  const [form, setForm] = useState(EMPTY);

  const sorted = sortEntries(entries);
  const s = summarize(entries);
  const advice = advise(s, profit.marginBeforeAds, profit.breakEvenRoas);

  function add(e: FormEvent) {
    e.preventDefault();
    const entry: DayEntry = {
      date,
      spend: Number(form.spend) || 0,
      clicks: Number(form.clicks) || 0,
      sales: Number(form.sales) || 0,
      revenue: Number(form.revenue) || 0,
    };
    // Une seule ligne par jour : une nouvelle saisie remplace l'ancienne.
    setEntries((prev) => [...prev.filter((x) => x.date !== date), entry]);
    setForm(EMPTY);
  }

  const input = (key: keyof typeof EMPTY, label: string, step = "1") => (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min="0" step={step} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );

  return (
    <div className="tracker">
      <p className="muted">
        Seuils repris du <Link to="/outils/profit">calculateur de rentabilité</Link> : CPA max {eur(profit.marginBeforeAds)}, ROAS de
        rentabilité {num(profit.breakEvenRoas, 2)}.
      </p>
      <form className="tracker-form" onSubmit={add}>
        <label className="field">
          <span>Date</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {input("spend", "Dépense (€)", "0.01")}
        {input("clicks", "Clics")}
        {input("sales", "Ventes")}
        {input("revenue", "Valeur des ventes (€)", "0.01")}
        <button className="btn btn-primary" type="submit">
          Enregistrer le jour
        </button>
      </form>

      {sorted.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Dépense</th>
                <th scope="col">Clics</th>
                <th scope="col">CPC</th>
                <th scope="col">Ventes</th>
                <th scope="col">ROAS</th>
                <th scope="col">
                  <span className="sr-only">Supprimer</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.date}>
                  <th scope="row">{new Date(e.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</th>
                  <td>{eur(e.spend, 2)}</td>
                  <td>{e.clicks}</td>
                  <td>{e.clicks ? eur(e.spend / e.clicks, 2) : "—"}</td>
                  <td>{e.sales}</td>
                  <td>{e.spend ? num(e.revenue / e.spend, 2) : "—"}</td>
                  <td>
                    <button
                      className="icon-btn"
                      type="button"
                      aria-label={`Supprimer le ${e.date}`}
                      onClick={() => setEntries((prev) => prev.filter((x) => x.date !== e.date))}
                    >
                      <Icon name="bad" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{eur(s.spend, 2)}</td>
                <td>{s.clicks}</td>
                <td>{s.clicks ? eur(s.spend / s.clicks, 2) : "—"}</td>
                <td>{s.sales}</td>
                <td>{s.spend ? num(s.roas, 2) : "—"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Verdict tone={advice.tone}>{advice.message}</Verdict>
    </div>
  );
}
