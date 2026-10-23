import { useEffect, useState } from "react";
import { api, type AgendaSettings, type AppointmentType, type EmailStatus } from "../api";
import { ErrorBanner, Icon } from "../ui";

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "rdv";

/** Connexion Google partagée (Gmail + Agenda) : on demande l'accord si l'agenda manque. */
export function GoogleCalendarStatus({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<EmailStatus>("/api/email/status").then(setStatus).catch((e) => setError(e.message));
  }, []);
  async function connect() {
    try {
      const { url } = await api.post<{ url: string }>("/api/email/connect");
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    }
  }
  if (!status) return <ErrorBanner message={error} />;
  if (status.calendar) {
    return <p className="all-good"><Icon name="checkCircle" />Google Agenda connecté ({status.email}).</p>;
  }
  return (
    <div className="banner" role="note">
      <p>{status.connected
        ? "Votre compte Google est connecté, mais l'accès à l'agenda n'a pas encore été autorisé."
        : "Connectez votre compte Google pour que l'assistant voie vos disponibilités et réserve dans votre agenda."}</p>
      <ErrorBanner message={error} />
      <button className="btn btn-primary" disabled={!isAdmin || !status.configured} onClick={connect}>
        {status.connected ? "Autoriser l'agenda" : "Connecter Google Agenda"}
      </button>
    </div>
  );
}

export function AgendaSettingsForm({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<AgendaSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<AgendaSettings>("/api/agenda/settings").then(setS).catch((e) => setError(e.message));
  }, []);
  if (!s) return <ErrorBanner message={error} />;

  const set = (patch: Partial<AgendaSettings>) => { setS({ ...s, ...patch }); setSaved(false); };
  const setType = (i: number, patch: Partial<AppointmentType>) =>
    set({ types: s.types.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setRange = (day: string, i: number, k: 0 | 1, v: string) => {
    const ranges = [...(s.weekly[day] ?? [])];
    ranges[i] = (k === 0 ? [v, ranges[i][1]] : [ranges[i][0], v]) as [string, string];
    set({ weekly: { ...s.weekly, [day]: ranges } });
  };

  async function save() {
    setError(null);
    const types = s!.types.map((t) => ({ ...t, id: t.id || slug(t.name) }));
    try {
      setS(await api.patch<AgendaSettings>("/api/agenda/settings", {
        types, weekly: s!.weekly, buffer_min: Number(s!.buffer_min), step_min: Number(s!.step_min),
        min_notice_hours: Number(s!.min_notice_hours), horizon_days: Number(s!.horizon_days),
        location: s!.location || null,
      }));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("Certaines")
        ? "Vérifiez les horaires : l'heure de fin doit être après l'heure de début." : e instanceof Error ? e.message : "Erreur.");
    }
  }

  return (
    <div className="agenda-settings">
      <h3>Types de rendez-vous</h3>
      {s.types.map((t, i) => (
        <div className="type-row" key={i}>
          <label className="field"><span>Nom</span>
            <input value={t.name} disabled={!isAdmin} onChange={(e) => setType(i, { name: e.target.value })} /></label>
          <label className="field"><span>Durée (min)</span>
            <input type="number" min={5} max={480} value={t.duration} disabled={!isAdmin}
                   onChange={(e) => setType(i, { duration: Number(e.target.value) })} /></label>
          {isAdmin && s.types.length > 1 && (
            <button className="btn btn-icon" aria-label={`Retirer ${t.name}`}
                    onClick={() => set({ types: s.types.filter((_, j) => j !== i) })}><Icon name="trash" /></button>
          )}
        </div>
      ))}
      {isAdmin && (
        <button className="btn btn-ghost btn-small" onClick={() => set({ types: [...s.types, { id: "", name: "Nouveau type", duration: 30 }] })}>
          <Icon name="plus" size={16} />Ajouter un type
        </button>
      )}

      <h3>Disponibilités</h3>
      <p className="muted">L'assistant ne propose que ces plages, et jamais un moment déjà pris dans votre agenda Google.</p>
      {DAYS.map((day) => {
        const ranges = s.weekly[day] ?? [];
        return (
          <div className="day-row" key={day}>
            <label className="day-toggle">
              <input type="checkbox" checked={ranges.length > 0} disabled={!isAdmin}
                     onChange={(e) => set({ weekly: { ...s.weekly, [day]: e.target.checked ? [["09:00", "12:00"]] : [] } })} />
              <span>{day[0].toUpperCase() + day.slice(1)}</span>
            </label>
            <div className="ranges">
              {ranges.length === 0 && <span className="muted">Fermé</span>}
              {ranges.map((r, i) => (
                <span className="range" key={i}>
                  <input type="time" aria-label={`${day} début`} value={r[0]} disabled={!isAdmin} onChange={(e) => setRange(day, i, 0, e.target.value)} />
                  <span aria-hidden="true">–</span>
                  <input type="time" aria-label={`${day} fin`} value={r[1]} disabled={!isAdmin} onChange={(e) => setRange(day, i, 1, e.target.value)} />
                  {isAdmin && (
                    <button className="btn btn-icon btn-small" aria-label="Retirer la plage"
                            onClick={() => set({ weekly: { ...s.weekly, [day]: ranges.filter((_, j) => j !== i) } })}><Icon name="x" size={16} /></button>
                  )}
                </span>
              ))}
              {isAdmin && ranges.length > 0 && ranges.length < 3 && (
                <button className="link" onClick={() => set({ weekly: { ...s.weekly, [day]: [...ranges, ["14:00", "18:00"]] } })}>+ plage</button>
              )}
            </div>
          </div>
        );
      })}

      <div className="form-grid">
        <label className="field"><span>Marge entre deux rendez-vous (min)</span>
          <input type="number" min={0} max={120} value={s.buffer_min} disabled={!isAdmin} onChange={(e) => set({ buffer_min: Number(e.target.value) })} /></label>
        <label className="field"><span>Délai minimum avant un rendez-vous (h)</span>
          <input type="number" min={0} max={168} value={s.min_notice_hours} disabled={!isAdmin} onChange={(e) => set({ min_notice_hours: Number(e.target.value) })} /></label>
        <label className="field"><span>Réservable jusqu'à (jours)</span>
          <input type="number" min={1} max={120} value={s.horizon_days} disabled={!isAdmin} onChange={(e) => set({ horizon_days: Number(e.target.value) })} /></label>
        <label className="field"><span>Pas des créneaux (min)</span>
          <input type="number" min={5} max={120} value={s.step_min} disabled={!isAdmin} onChange={(e) => set({ step_min: Number(e.target.value) })} /></label>
        <label className="field span-2"><span>Adresse du rendez-vous (dans l'agenda et les rappels)</span>
          <input value={s.location ?? ""} disabled={!isAdmin} onChange={(e) => set({ location: e.target.value })} /></label>
      </div>
      <ErrorBanner message={error} />
      {saved && <div className="banner banner-ok" role="status">Réglages des rendez-vous enregistrés.</div>}
      {isAdmin && <button className="btn btn-primary" onClick={save}>Enregistrer les rendez-vous</button>}
    </div>
  );
}
