import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Contact } from "../api";
import { formatPhone, formatWhen } from "../format";
import { EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

export function ContactsPage() {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<Contact[]>(`/api/contacts?q=${encodeURIComponent(query)}`)
        .then(setContacts)
        .catch((e) => setError(e.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <>
      <PageHeader
        title="Clients"
        intro="Chaque appel crée ou complète automatiquement la fiche du client."
        actions={
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Nouveau client
          </button>
        }
      />
      {adding && <NewContactForm onClose={() => setAdding(false)} />}
      <label className="search">
        <Icon name="search" />
        <span className="visually-hidden">Rechercher un client</span>
        <input type="search" placeholder="Nom, téléphone, e-mail…" value={query}
               onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ErrorBanner message={error} />
      {!contacts && !error && <Spinner />}
      {contacts?.length === 0 && (
        <EmptyState icon="users" title={query ? "Aucun résultat" : "Pas encore de client"}>
          {query ? "Essayez avec un autre nom ou numéro." : "Les clients qui appellent apparaîtront ici."}
        </EmptyState>
      )}
      {contacts && contacts.length > 0 && (
        <ul className="card list">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link to={`/clients/${c.id}`} className="list-row">
                <span className="avatar" aria-hidden="true">{c.name.charAt(0).toUpperCase()}</span>
                <span className="list-main">
                  <strong>{c.name}</strong>
                  <span>{[formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}</span>
                </span>
                {c.last_interaction_at && (
                  <time className="muted" dateTime={c.last_interaction_at}>
                    {formatWhen(c.last_interaction_at)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewContactForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    if (!Object.keys(body).length) return setError("Renseignez au moins un nom ou un numéro.");
    try {
      const c = await api.post<Contact>("/api/contacts", body);
      navigate(`/clients/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    }
  }

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <h2>Nouveau client</h2>
      <ErrorBanner message={error} />
      {field("first_name", "Prénom")}
      {field("last_name", "Nom")}
      {field("phone", "Téléphone", "tel")}
      {field("email", "E-mail", "email")}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary">Créer la fiche</button>
      </div>
    </form>
  );
}
