import { useEffect, useState } from "react";
import { api, type ExtrasSettings, type ReviewsOverview } from "../api";
import { ErrorBanner, Icon } from "../ui";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function useExtras() {
  const [s, setS] = useState<ExtrasSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<ExtrasSettings>("/api/extras/settings").then(setS).catch((e) => setError(e.message));
  }, []);
  async function save(patch: Partial<ExtrasSettings>) {
    setError(null);
    try {
      setS(await api.patch<ExtrasSettings>("/api/extras/settings", patch));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      return false;
    }
  }
  return { s, setS, error, setError, save };
}

export function SummarySettings({ isAdmin }: { isAdmin: boolean }) {
  const { s, setS, error, setError, save } = useExtras();
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!s) return <ErrorBanner message={error} />;

  const toggleDay = (d: number) =>
    setS({ ...s, summary_days: s.summary_days.includes(d) ? s.summary_days.filter((x) => x !== d) : [...s.summary_days, d].sort() });

  async function showPreview() {
    try {
      setPreview((await api.get<{ text: string }>("/api/extras/summary/preview")).text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aperçu impossible.");
    }
  }
  async function sendTest() {
    setNotice(null);
    try {
      await api.post("/api/extras/summary/send");
      setNotice("Résumé envoyé sur WhatsApp.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    }
  }

  return (
    <div className="extras-panel">
      {s.whatsapp_numbers === 0 && (
        <div className="banner" role="note">Aucun numéro WhatsApp gérant n'est enregistré : le résumé ne peut pas partir. Contactez Zunqoo pour l'ajouter.</div>
      )}
      <div className="form-grid">
        <label className="field"><span>Heure d'envoi</span>
          <input type="time" value={s.summary_time} disabled={!isAdmin} onChange={(e) => setS({ ...s, summary_time: e.target.value })} /></label>
        <fieldset className="field days-field">
          <legend>Jours d'envoi</legend>
          <div className="day-chips">
            {DAYS.map((d, i) => (
              <label key={d} className={`day-chip ${s.summary_days.includes(i) ? "on" : ""}`}>
                <input type="checkbox" className="visually-hidden" checked={s.summary_days.includes(i)} disabled={!isAdmin}
                       onChange={() => toggleDay(i)} aria-label={DAY_NAMES[i]} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="muted">
        {s.summary_last_sent ? `Dernier résumé envoyé le ${new Date(s.summary_last_sent).toLocaleDateString("fr-FR")}.` : "Aucun résumé envoyé pour l'instant."}
      </p>
      <ErrorBanner message={error} />
      {notice && <div className="banner banner-ok" role="status">{notice}</div>}
      <div className="presets">
        {isAdmin && <button className="btn btn-primary" onClick={async () => {
          if (await save({ summary_time: s.summary_time, summary_days: s.summary_days })) setNotice("Réglages du résumé enregistrés.");
        }}>Enregistrer</button>}
        <button className="btn btn-ghost" onClick={showPreview}>Voir le résumé d'aujourd'hui</button>
        {isAdmin && s.whatsapp_numbers > 0 && <button className="btn btn-ghost" onClick={sendTest}>M'envoyer un essai</button>}
      </div>
      {preview && <pre className="transcript whatsapp-preview">{preview.replace(/\*/g, "")}</pre>}
    </div>
  );
}

export function ReviewSettings({ isAdmin, emailReady }: { isAdmin: boolean; emailReady: boolean }) {
  const { s, setS, error, save } = useExtras();
  const [overview, setOverview] = useState<ReviewsOverview | null>(null);
  const [saved, setSaved] = useState(false);
  const loadOverview = () => api.get<ReviewsOverview>("/api/extras/reviews").then(setOverview).catch(() => {});
  useEffect(() => { loadOverview(); }, []);
  if (!s) return <ErrorBanner message={error} />;

  const stats = overview?.last_30_days;
  return (
    <div className="extras-panel">
      {!emailReady && (
        <div className="banner" role="note">Les demandes partent par e-mail : activez le module « E-mails » et connectez Gmail. L'affiche QR code fonctionne sans.</div>
      )}
      <label className="field"><span>Votre lien d'avis Google</span>
        <input type="url" inputMode="url" placeholder="https://g.page/r/…/review" value={s.review_link ?? ""} disabled={!isAdmin}
               onChange={(e) => { setS({ ...s, review_link: e.target.value }); setSaved(false); }} />
        <small className="muted">Dans Google (« Mon entreprise » ou Google Maps, connecté à votre fiche) : <em>Demander des avis</em> → copier le lien.</small>
      </label>
      <label className="field"><span>Délai après la commande ou le rendez-vous</span>
        <select value={s.review_delay_hours} disabled={!isAdmin} onChange={(e) => { setS({ ...s, review_delay_hours: Number(e.target.value) }); setSaved(false); }}>
          {[[3, "3 heures"], [24, "1 jour"], [48, "2 jours"], [72, "3 jours"], [168, "1 semaine"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="field"><span>Message envoyé ({"{prenom}"} et {"{lien}"} sont remplacés automatiquement)</span>
        <textarea rows={8} value={s.review_message ?? s.default_review_message} disabled={!isAdmin}
                  onChange={(e) => { setS({ ...s, review_message: e.target.value }); setSaved(false); }} />
      </label>
      <p className="muted">Chaque client reçoit au plus une demande tous les 6 mois. Pour respecter les règles de Google, tous les clients sont sollicités de la même façon, sans cadeau ni réduction en échange.</p>
      <ErrorBanner message={error} />
      {saved && <div className="banner banner-ok" role="status">Réglages des avis enregistrés.</div>}
      <div className="presets">
        {isAdmin && <button className="btn btn-primary" onClick={async () => {
          const msg = s.review_message && s.review_message.trim() !== s.default_review_message.trim() ? s.review_message : null;
          if (await save({ review_link: s.review_link ?? "", review_delay_hours: s.review_delay_hours, review_message: msg })) {
            setSaved(true);
            loadOverview();
          }
        }}>Enregistrer</button>}
        <button className="btn btn-ghost" disabled={!s.review_link}
                onClick={() => api.openPdf("/api/extras/reviews/poster.pdf").catch(() => {})}>
          <Icon name="download" size={16} />Affiche QR code pour le comptoir
        </button>
      </div>
      {stats && (
        <p className="review-stats">
          30 derniers jours : <strong>{stats.envoye}</strong> demande(s) envoyée(s)
          {stats.a_valider > 0 && <> · {stats.a_valider} à valider</>}
          {stats.sans_email > 0 && <> · {stats.sans_email} client(s) sans e-mail (pensez à l'affiche)</>}
        </p>
      )}
    </div>
  );
}
