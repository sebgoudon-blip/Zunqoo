import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AgendaSettings, type AppointmentOut, type Contact } from "../api";
import { useAuth } from "../auth";
import { formatPhone } from "../format";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

const STATUS = { a_confirmer: "À confirmer", confirme: "Confirmé", annule: "Annulé" };

export function AgendaPage() {
  const [items, setItems] = useState<AppointmentOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Heures affichées dans le fuseau du commerce, quel que soit l'appareil.
  const timeZone = useAuth().me?.business.timezone ?? "Europe/Paris";
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone });
  const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });

  const load = () => api.get<AppointmentOut[]>("/api/agenda/appointments?days=60").then(setItems)
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function cancel(a: AppointmentOut) {
    if (!window.confirm(`Annuler le rendez-vous de ${a.contact?.name ?? "ce client"} ? Il sera retiré de votre agenda Google.`)) return;
    try {
      const updated = await api.post<AppointmentOut>(`/api/agenda/appointments/${a.id}/cancel`);
      setItems((list) => list?.map((x) => (x.id === a.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annulation impossible.");
    }
  }

  const groups = new Map<string, AppointmentOut[]>();
  for (const a of items?.filter((x) => x.status !== "annule") ?? []) {
    const key = dayFmt.format(new Date(a.start));
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <>
      <PageHeader title="Agenda" intro="Les rendez-vous pris par l'assistant (téléphone, e-mail) et les vôtres. Ils sont aussi dans votre agenda Google."
                  actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" />Nouveau rendez-vous</button>} />
      <ErrorBanner message={error} />
      {adding && <NewAppointment onClose={() => setAdding(false)} onBooked={(a) => { setAdding(false); setItems([...(items ?? []), a].sort((x, y) => x.start.localeCompare(y.start))); }} />}
      {!items && !error && <Spinner />}
      {items && groups.size === 0 && <EmptyState icon="phone" title="Aucun rendez-vous à venir">Les rendez-vous pris au téléphone ou par e-mail apparaîtront ici.</EmptyState>}
      {[...groups.entries()].map(([day, list]) => (
        <section className="card" key={day}>
          <h2>{day[0].toUpperCase() + day.slice(1)}</h2>
          <ul className="order-list">
            {list.map((a) => (
              <li key={a.id}>
                <strong className="appt-time">{timeFmt.format(new Date(a.start))}</strong>
                <div className="todo-main">
                  <strong>{a.contact ? <Link to={`/clients/${a.contact.id}`}>{a.contact.name}</Link> : "Client"}
                    {a.contact?.phone && <span className="muted nowrap"> · {formatPhone(a.contact.phone)}</span>}</strong>
                  <span className="muted">{a.type_name}{a.notes ? ` — ${a.notes}` : ""} · {a.source === "appel" ? "pris au téléphone" : a.source === "email" ? "pris par e-mail" : "ajouté par vous"}</span>
                </div>
                {a.status === "a_confirmer" && <Link className="pill pill-a_valider" to="/a-valider">{STATUS[a.status]}</Link>}
                <button className="btn btn-small btn-ghost" onClick={() => cancel(a)}>Annuler</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function NewAppointment({ onClose, onBooked }: { onClose: () => void; onBooked: (a: AppointmentOut) => void }) {
  const [settings, setSettings] = useState<AgendaSettings | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [typeId, setTypeId] = useState("");
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<{ start: string; label: string }[] | null>(null);
  const [start, setStart] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AgendaSettings>("/api/agenda/settings").then((s) => { setSettings(s); setTypeId(s.types[0]?.id ?? ""); }).catch((e) => setError(e.message));
    api.get<Contact[]>("/api/contacts").then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!typeId) return;
    setSlots(null);
    setStart("");
    api.get<{ slots: { start: string; label: string }[] }>(`/api/agenda/slots?type=${encodeURIComponent(typeId)}${day ? `&day=${day}` : ""}`)
      .then((r) => setSlots(r.slots)).catch((e) => { setError(e.message); setSlots([]); });
  }, [typeId, day]);

  async function submit() {
    setError(null);
    try {
      onBooked(await api.post<AppointmentOut>("/api/agenda/appointments", {
        type_id: typeId, start, contact_id: contactId || null, notes: notes || null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Réservation impossible.");
    }
  }

  return (
    <section className="card form-grid">
      <h2>Nouveau rendez-vous</h2>
      <ErrorBanner message={error} />
      <label className="field"><span>Type</span>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {settings?.types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration} min)</option>)}
        </select></label>
      <label className="field"><span>Jour (facultatif)</span>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
      <label className="field span-2"><span>Créneau libre</span>
        <select value={start} onChange={(e) => setStart(e.target.value)} disabled={!slots}>
          <option value="">{slots === null ? "Recherche des créneaux…" : slots.length ? "— Choisir —" : "Aucun créneau libre"}</option>
          {slots?.map((s) => <option key={s.start} value={s.start}>{s.label}</option>)}
        </select></label>
      <label className="field"><span>Client</span>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">— Choisir un client —</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <label className="field"><span>Remarque</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!start} onClick={submit}>Réserver</button>
      </div>
    </section>
  );
}
