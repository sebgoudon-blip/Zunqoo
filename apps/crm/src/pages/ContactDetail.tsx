import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Contact, type Interaction } from "../api";
import { formatPhone, formatWhen } from "../format";
import { CHANNEL_ICON, ErrorBanner, Icon, Spinner } from "../ui";

interface OrderLine {
  product: string;
  quantity: number;
  unit?: string | null;
}

function OrderDetails({ i }: { i: Interaction }) {
  const report = i.data.report as { order_lines?: OrderLine[]; requested_day?: string } | null;
  if (!report?.order_lines?.length) return null;
  return (
    <p className="order">
      {report.order_lines.map((l) => `${l.quantity} ${l.unit ?? ""} ${l.product}`.replace(/\s+/g, " ")).join(", ")}
      {report.requested_day && ` — ${report.requested_day}`}
    </p>
  );
}

export function ContactDetailPage() {
  const { id } = useParams();
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    api.get<Contact>(`/api/contacts/${id}`).then(setContact).catch((e) => setError(e.message));
  }, [id]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim() || !contact) return;
    try {
      const created = await api.post<Interaction>(`/api/contacts/${contact.id}/notes`, { text: note });
      setContact({ ...contact, interactions: [created, ...(contact.interactions ?? [])] });
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Note non enregistrée.");
    }
  }

  if (error && !contact) return <ErrorBanner message={error} />;
  if (!contact) return <Spinner />;

  return (
    <>
      <Link to="/clients" className="back-link">
        <Icon name="back" size={16} />
        Tous les clients
      </Link>
      <header className="page-header">
        <div>
          <h1>{contact.name}</h1>
          <p className="intro">
            {[formatPhone(contact.phone), contact.email, contact.company].filter(Boolean).join(" · ") ||
              "Aucune coordonnée"}
          </p>
        </div>
        <div className="page-actions">
          {contact.phone && (
            <a className="btn btn-ghost" href={`tel:${contact.phone}`}>
              <Icon name="phone" />
              Appeler
            </a>
          )}
          <button className="btn btn-ghost" onClick={() => setEditing(!editing)}>
            {editing ? "Fermer" : "Modifier"}
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />
      {editing && <EditContact contact={contact} onSaved={(c) => { setContact({ ...contact, ...c }); setEditing(false); }} />}

      <section className="card">
        <h2>Ajouter une note</h2>
        <form className="note-form" onSubmit={addNote}>
          <label className="visually-hidden" htmlFor="note">Note</label>
          <textarea id="note" rows={2} value={note} placeholder="Ex. : préfère être rappelé le matin"
                    onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary" disabled={!note.trim()}>Enregistrer</button>
        </form>
      </section>

      <section className="card">
        <h2>Historique</h2>
        {!contact.interactions?.length && <p className="muted">Aucun échange pour l'instant.</p>}
        <ul className="timeline">
          {contact.interactions?.map((i) => (
            <li key={i.id}>
              <span className={`chan chan-${i.channel}`}>
                <Icon name={CHANNEL_ICON[i.channel] ?? "note"} size={16} />
              </span>
              <div>
                <div className="timeline-head">
                  <strong>{i.title}</strong>
                  <time dateTime={i.occurred_at}>{formatWhen(i.occurred_at)}</time>
                </div>
                {i.summary && <p>{i.summary}</p>}
                <OrderDetails i={i} />
                {i.body && i.channel === "appel" && (
                  <details>
                    <summary>Voir la conversation</summary>
                    <pre className="transcript">{i.body}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function EditContact({ contact, onSaved }: { contact: Contact; onSaved: (c: Contact) => void }) {
  const [form, setForm] = useState({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    company: contact.company ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    address: contact.address ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    try {
      onSaved(await api.patch<Contact>(`/api/contacts/${contact.id}`, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    }
  }

  const labels: Record<keyof typeof form, string> = {
    first_name: "Prénom", last_name: "Nom", company: "Société", phone: "Téléphone",
    email: "E-mail", address: "Adresse",
  };
  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <ErrorBanner message={error} />
      {(Object.keys(form) as (keyof typeof form)[]).map((key) => (
        <label className="field" key={key}>
          <span>{labels[key]}</span>
          <input type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} value={form[key]}
                 onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </label>
      ))}
      <div className="form-actions">
        <button className="btn btn-primary">Enregistrer</button>
      </div>
    </form>
  );
}
