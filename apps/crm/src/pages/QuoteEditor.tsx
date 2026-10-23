import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type BusinessInfo, type CatalogItem, type Contact, type QuoteFull } from "../api";
import { useAuth } from "../auth";
import { formatEuro } from "../format";
import { ErrorBanner, Icon, Spinner } from "../ui";
import { LinesEditor, linesPayload, previewTotal, toEdit, validateLines, type EditLine } from "./LinesEditor";
import { QUOTE_STATUS } from "./Quotes";
import { QuoteSignatureCard } from "./QuoteSignature";

function defaultEmail(q: QuoteFull, signature: string): string {
  const first = q.contact?.name.split(" ")[0];
  return `Bonjour${first ? " " + first : ""},\n\nVeuillez trouver ci-joint notre devis « ${q.title} ».\n` +
    "Vous pouvez l'accepter et le signer en ligne, en une minute, depuis votre téléphone ou votre ordinateur :\n" +
    "[lien de signature]\n\n" +
    `Nous restons à votre disposition pour toute question.\n\nBien cordialement,\n${signature}`;
}

export function QuoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me, hasModule } = useAuth();
  const [quote, setQuote] = useState<QuoteFull | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<string | null>(null); // texte de l'e-mail en cours d'édition

  function load(q: QuoteFull) {
    setQuote(q);
    setLines(q.lines.map(toEdit));
    setTitle(q.title);
    setContactId(q.contact?.id ?? "");
    setNotes(q.notes ?? "");
    setDirty(false);
  }

  useEffect(() => {
    api.get<QuoteFull>(`/api/quotes/${id}`).then(load).catch((e) => setError(e.message));
    api.get<CatalogItem[]>("/api/catalog").then((c) => setCatalog(c.filter((i) => i.active))).catch(() => {});
    api.get<Contact[]>("/api/contacts").then(setContacts).catch(() => {});
    api.get<BusinessInfo>("/api/business").then(setBusiness).catch(() => {});
  }, [id]);

  const editable = quote?.status === "brouillon" || quote?.status === "a_valider";
  const preview = previewTotal(lines);

  async function save(): Promise<QuoteFull | null> {
    if (!quote) return null;
    const invalid = validateLines(lines);
    if (invalid) { setError(invalid); return null; }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.patch<QuoteFull>(`/api/quotes/${quote.id}`, {
        title, contact_id: contactId || null, notes: notes || null,
        lines: linesPayload(lines),
      });
      load(saved);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<QuoteFull | void>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const q = await fn();
      if (q) load(q);
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    if (dirty && !(await save())) return;
    api.openPdf(`/api/quotes/${quote!.id}/pdf`).catch((e) => setError(e.message));
  }

  async function startSend() {
    const saved = dirty ? await save() : quote;
    if (!saved) return;
    setSending(saved.email_body || defaultEmail(saved, [business?.legal_name, business?.phone].filter(Boolean).join("\n")));
  }

  if (!quote) return error ? <ErrorBanner message={error} /> : <Spinner />;
  const hasEmail = Boolean(contacts.find((c) => c.id === contactId)?.email ?? quote.contact?.email);

  return (
    <>
      <Link to="/devis" className="back-link"><Icon name="back" size={16} />Tous les devis</Link>
      <header className="page-header">
        <div>
          <h1>{quote.number ? `Devis ${quote.number}` : "Nouveau devis"}</h1>
          <p className="intro">
            <span className={`pill pill-${quote.status}`}>{QUOTE_STATUS[quote.status]}</span>
            {quote.source === "email" && " · préparé par l'assistant à partir d'un e-mail"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={openPdf} disabled={busy}>Voir le PDF</button>
          {!editable && (
            <button className="btn btn-ghost" disabled={busy}
                    onClick={() => act(async () => {
                      const copy = await api.post<QuoteFull>(`/api/quotes/${quote.id}/duplicate`);
                      navigate(`/devis/${copy.id}`);
                    })}>
              Dupliquer
            </button>
          )}
        </div>
      </header>
      <ErrorBanner message={error} />
      {notice && <div className="banner banner-ok" role="status">{notice}</div>}
      {quote.internal_notes && <div className="banner" role="note">{quote.internal_notes}</div>}
      {editable && business && business.missing.length > 0 && (
        <div className="banner" role="note">
          Pour envoyer un devis, complétez vos informations légales ({business.missing.join(", ")}) dans{" "}
          <Link to="/reglages#entreprise">Réglages</Link>.
        </div>
      )}

      <section className="card form-grid">
        <label className="field span-2">
          <span>Objet</span>
          <input value={title} disabled={!editable} placeholder="Ex. : Repas d'anniversaire, 40 personnes"
                 onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        </label>
        <label className="field span-2">
          <span>Client</span>
          <select value={contactId} disabled={!editable}
                  onChange={(e) => { setContactId(e.target.value); setDirty(true); }}>
            <option value="">— Choisir un client —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Lignes ({quote.prices_include_vat ? "prix TTC" : "prix HT"})</h2>
        <LinesEditor lines={lines} editable={editable} catalog={catalog} label="Lignes du devis"
                     pricesIncludeVat={quote.prices_include_vat} defaultVat={me?.business.default_vat_rate ?? 20}
                     onChange={(next) => { setLines(next); setDirty(true); }} />
        <div className="quote-totals">
          {dirty ? (
            <p className="muted">Total estimé : <strong>{formatEuro(preview)}</strong> — enregistrez pour le calcul exact de la TVA.</p>
          ) : (
            <p>Total HT <strong>{formatEuro(quote.total_ht)}</strong> · Total TTC <strong className="big-total">{formatEuro(quote.total_ttc)}</strong></p>
          )}
        </div>
        <label className="field">
          <span>Remarque visible sur le devis</span>
          <textarea rows={2} value={notes} disabled={!editable}
                    onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
        </label>
      </section>

      {editable && (
        <div className="sticky-actions">
          <button className="btn btn-ghost" disabled={busy || !dirty} onClick={save}>
            {dirty ? "Enregistrer" : "Enregistré"}
          </button>
          <button className="btn btn-primary" disabled={busy || !hasEmail} onClick={startSend}
                  title={hasEmail ? undefined : "Le client n'a pas d'adresse e-mail"}>
            <Icon name="mail" />Envoyer par e-mail
          </button>
          <button className="btn btn-ghost" disabled={busy}
                  onClick={() => window.confirm("Le devis sera numéroté et marqué comme remis au client. Continuer ?") &&
                    act(async () => {
                      if (dirty && !(await save())) return;
                      return api.post<QuoteFull>(`/api/quotes/${quote.id}/send`, { by_email: false });
                    }, "Devis numéroté. Téléchargez le PDF pour le remettre au client.")}>
            Remis en main propre
          </button>
          {quote.status === "brouillon" && !quote.number && (
            <button className="btn btn-icon" aria-label="Supprimer le brouillon"
                    onClick={() => window.confirm("Supprimer ce brouillon ?") &&
                      act(async () => { await api.del(`/api/quotes/${quote.id}`); navigate("/devis"); })}>
              <Icon name="trash" />
            </button>
          )}
        </div>
      )}

      {sending !== null && (
        <section className="card">
          <h2>Message d'accompagnement</h2>
          <p className="muted">Le devis part en PDF joint{quote.source === "email" ? ", en réponse à l'e-mail du client" : ""}.</p>
          <label className="visually-hidden" htmlFor="send-body">Message</label>
          <textarea id="send-body" rows={9} value={sending} onChange={(e) => setSending(e.target.value)} />
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setSending(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={busy || !sending.trim()}
                    onClick={() => act(async () => {
                      const q = await api.post<QuoteFull>(`/api/quotes/${quote.id}/send`, { email_body: sending });
                      setSending(null);
                      return q;
                    }, "Devis envoyé au client.")}>
              Envoyer le devis
            </button>
          </div>
        </section>
      )}

      {quote.number && quote.status !== "brouillon" && <QuoteSignatureCard quote={quote} />}

      {(quote.status === "envoye" || quote.status === "expire") && (
        <section className="card">
          <h2>Réponse du client</h2>
          <p className="muted">
            {quote.reminders_sent > 0 ? `${quote.reminders_sent} relance(s) proposée(s). ` : ""}
            Si le client répond autrement qu'en signant en ligne, notez sa réponse pour arrêter les relances.
          </p>
          <div className="presets">
            <button className="btn btn-primary" disabled={busy}
                    onClick={() => act(() => api.post<QuoteFull>(`/api/quotes/${quote.id}/status`, { status: "accepte" }), "Devis accepté.")}>
              <Icon name="check" />Accepté
            </button>
            <button className="btn btn-ghost" disabled={busy}
                    onClick={() => act(() => api.post<QuoteFull>(`/api/quotes/${quote.id}/status`, { status: "refuse" }), "Devis marqué refusé.")}>
              <Icon name="x" />Refusé
            </button>
          </div>
        </section>
      )}
      {(quote.status === "accepte" || quote.status === "facture") && hasModule("factures") && (
        <section className="card">
          <h2>Facturation</h2>
          <p className="muted">
            {quote.status === "facture" ? "Ce devis a été facturé." : "Le devis est accepté : préparez la facture en un clic, vous la vérifierez avant de l'émettre."}
          </p>
          <button className="btn btn-primary" disabled={busy}
                  onClick={() => act(async () => {
                    const inv = await api.post<{ id: string }>(`/api/quotes/${quote.id}/invoice`);
                    navigate(`/factures/${inv.id}`);
                  })}>
            {quote.status === "facture" ? "Voir la facture" : "Créer la facture"}
          </button>
        </section>
      )}
    </>
  );
}
