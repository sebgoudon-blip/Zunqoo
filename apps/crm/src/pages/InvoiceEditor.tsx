import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type BusinessInfo, type CatalogItem, type Contact, type InvoiceFull } from "../api";
import { useAuth } from "../auth";
import { formatEuro, formatWhen, parseEuroInput } from "../format";
import { ErrorBanner, Icon, Spinner } from "../ui";
import { statusLabel } from "./Invoices";
import { LinesEditor, linesPayload, previewTotal, toEdit, loadActiveCatalog, validateLines,
         type EditLine } from "./LinesEditor";

const METHODS: Record<string, string> = { virement: "Virement", carte: "Carte", especes: "Espèces", cheque: "Chèque" };
const CATEGORIES: Record<string, string> = {
  biens: "Vente de biens (produits)", services: "Prestation de services", mixte: "Les deux",
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

export function InvoiceEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [inv, setInv] = useState<InvoiceFull | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("biens");
  const [dirty, setDirty] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState({ amount: "", method: "virement" });
  const [emailBody, setEmailBody] = useState<string | null>(null);

  function load(i: InvoiceFull) {
    setInv(i);
    setLines(i.lines.map(toEdit));
    setTitle(i.title);
    setContactId(i.contact?.id ?? "");
    setNotes(i.notes ?? "");
    setCategory(i.operation_category);
    setDirty(false);
    setPayment({ amount: i.remaining > 0 ? String(i.remaining).replace(".", ",") : "", method: "virement" });
  }

  useEffect(() => {
    api.get<InvoiceFull>(`/api/invoices/${id}`).then(load).catch((e) => setError(e.message));
    loadActiveCatalog(setCatalog)();
    api.get<Contact[]>("/api/contacts").then(setContacts).catch(() => {});
    api.get<BusinessInfo>("/api/business").then(setBusiness).catch(() => {});
  }, [id]);

  async function act(fn: () => Promise<InvoiceFull | void>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (r) load(r);
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<InvoiceFull | null> {
    const invalid = validateLines(lines);
    if (invalid) { setError(invalid); return null; }
    try {
      const saved = await api.patch<InvoiceFull>(`/api/invoices/${inv!.id}`, {
        title, contact_id: contactId || null, notes: notes || null, operation_category: category,
        lines: linesPayload(lines),
      });
      load(saved);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      return null;
    }
  }

  if (!inv) return error ? <ErrorBanner message={error} /> : <Spinner />;
  const draft = inv.status === "brouillon";
  const isInvoice = inv.kind === "facture";
  const label = isInvoice ? "Facture" : "Avoir";
  const open = isInvoice && (inv.status === "emise" || inv.status === "partiellement_payee");
  const hasEmail = Boolean(inv.contact?.email);

  return (
    <>
      <Link to="/factures" className="back-link"><Icon name="back" size={16} />Toutes les factures</Link>
      <header className="page-header">
        <div>
          <h1>{inv.number ? `${label} ${inv.number}` : `${label} (brouillon)`}</h1>
          <p className="intro">
            <span className={`pill pill-inv-${inv.overdue ? "retard" : inv.status}`}>{statusLabel(inv)}</span>
            {inv.issue_date && ` · émise le ${day(inv.issue_date)}`}
            {isInvoice && inv.due_date && ` · échéance ${day(inv.due_date)}`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" disabled={busy}
                  onClick={async () => {
                    if (draft && dirty && !(await save())) return;
                    api.openPdf(`/api/invoices/${inv.id}/pdf`).catch((e) => setError(e.message));
                  }}>
            {draft ? "Aperçu PDF" : "PDF"}
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />
      {notice && <div className="banner banner-ok" role="status">{notice}</div>}
      {draft && business && business.missing.length > 0 && (
        <div className="banner" role="note">
          Avant d'émettre, complétez vos informations légales ({business.missing.join(", ")}) dans{" "}
          <Link to="/reglages#entreprise">Réglages</Link>.
        </div>
      )}

      {draft ? (
        <>
          <section className="card form-grid">
            <label className="field span-2">
              <span>Objet</span>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
            </label>
            <label className="field">
              <span>Client</span>
              <select value={contactId} onChange={(e) => { setContactId(e.target.value); setDirty(true); }}>
                <option value="">— Choisir un client —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}{c.email ? ` (${c.email})` : ""}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Nature de l'opération</span>
              <select value={category} onChange={(e) => { setCategory(e.target.value); setDirty(true); }}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </section>
          <section className="card">
            <h2>Lignes ({inv.prices_include_vat ? "prix TTC" : "prix HT"})</h2>
            <LinesEditor lines={lines} editable catalog={catalog} label="Lignes de la facture"
                         pricesIncludeVat={inv.prices_include_vat} defaultVat={me?.business.default_vat_rate ?? 20}
                         onChange={(next) => { setLines(next); setDirty(true); }} />
            <div className="quote-totals">
              {dirty
                ? <p className="muted">Total estimé : <strong>{formatEuro(previewTotal(lines))}</strong></p>
                : <p>Total HT <strong>{formatEuro(inv.total_ht)}</strong> · TVA <strong>{formatEuro(inv.total_vat)}</strong> · Total TTC <strong className="big-total">{formatEuro(inv.total_ttc)}</strong></p>}
            </div>
            <label className="field">
              <span>Remarque visible sur la facture</span>
              <textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
            </label>
          </section>
          <div className="sticky-actions">
            <button className="btn btn-ghost" disabled={busy || !dirty} onClick={() => act(async () => { await save(); })}>
              {dirty ? "Enregistrer" : "Enregistré"}
            </button>
            <button className="btn btn-primary" disabled={busy}
                    onClick={() => window.confirm(
                      `Émettre ${isInvoice ? "la facture" : "l'avoir"} ? Elle recevra son numéro définitif et ne pourra plus être modifiée (une erreur se corrige ensuite par un avoir).`,
                    ) && act(async () => {
                      if (dirty && !(await save())) return;
                      return api.post<InvoiceFull>(`/api/invoices/${inv.id}/issue`);
                    }, `${label} émis${isInvoice ? "e" : ""}. Vous pouvez maintenant l'envoyer.`)}>
              <Icon name="check" />Émettre {isInvoice ? "la facture" : "l'avoir"}
            </button>
            <button className="btn btn-icon" aria-label="Supprimer le brouillon"
                    onClick={() => window.confirm("Supprimer ce brouillon ?") &&
                      act(async () => { await api.del(`/api/invoices/${inv.id}`); navigate("/factures"); })}>
              <Icon name="trash" />
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="card">
            <div className="invoice-head">
              <div>
                <p className="muted">Client</p>
                <strong>{inv.contact ? <Link to={`/clients/${inv.contact.id}`}>{inv.contact.name}</Link> : "—"}</strong>
                {inv.title && <p>{inv.title}</p>}
              </div>
              <div className="invoice-amounts">
                <span>Total TTC <strong>{formatEuro(inv.total_ttc)}</strong></span>
                {isInvoice && <span>Payé <strong>{formatEuro(inv.amount_paid)}</strong></span>}
                {isInvoice && <span className={inv.remaining > 0 ? "due" : ""}>Reste <strong>{formatEuro(inv.remaining)}</strong></span>}
              </div>
            </div>
            <ul className="list">
              {inv.lines.map((l, i) => (
                <li key={i} className="list-row">
                  <span className="list-main"><strong>{l.description}</strong>{l.detail && <span>{l.detail}</span>}</span>
                  <span className="muted">{l.quantity.replace(".", ",")} × {formatEuro(Number(l.unit_price))}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Envoi</h2>
            <p className="muted">{inv.sent_at ? `Envoyée par e-mail ${formatWhen(inv.sent_at)}.` : "Pas encore envoyée par e-mail."}</p>
            {emailBody === null ? (
              <div className="presets">
                <button className="btn btn-primary" disabled={busy || !hasEmail}
                        title={hasEmail ? undefined : "Le client n'a pas d'adresse e-mail"}
                        onClick={() => setEmailBody("")}>
                  <Icon name="mail" />{inv.sent_at ? "Renvoyer par e-mail" : "Envoyer par e-mail"}
                </button>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Message (laisser vide pour le message standard)</span>
                  <textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
                </label>
                <div className="form-actions">
                  <button className="btn btn-ghost" onClick={() => setEmailBody(null)}>Annuler</button>
                  <button className="btn btn-primary" disabled={busy}
                          onClick={() => act(async () => {
                            const r = await api.post<InvoiceFull>(`/api/invoices/${inv.id}/send`, { email_body: emailBody });
                            setEmailBody(null);
                            return r;
                          }, "Envoyée au client avec le PDF Factur-X.")}>
                    Envoyer
                  </button>
                </div>
              </>
            )}
          </section>

          {isInvoice && (
            <section className="card">
              <h2>Paiements</h2>
              {inv.payments.length === 0 && <p className="muted">Aucun paiement enregistré.</p>}
              <ul className="list">
                {inv.payments.map((p) => (
                  <li key={p.id} className="list-row">
                    <span className="list-main"><strong>{formatEuro(p.amount)}</strong><span>{METHODS[p.method] ?? p.method}{p.note ? ` · ${p.note}` : ""}</span></span>
                    <span className="muted">{day(p.paid_on)}</span>
                  </li>
                ))}
              </ul>
              {open && (
                <div className="payment-form">
                  <label className="field">
                    <span>Montant reçu (€)</span>
                    <input inputMode="decimal" value={payment.amount}
                           onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Moyen</span>
                    <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                      {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <button className="btn btn-primary" disabled={busy}
                          onClick={() => {
                            const amount = parseEuroInput(payment.amount);
                            if (amount === null || Number.isNaN(amount)) return setError("Montant invalide.");
                            act(() => api.post<InvoiceFull>(`/api/invoices/${inv.id}/payments`, { amount, method: payment.method }),
                                "Paiement enregistré.");
                          }}>
                    Enregistrer le paiement
                  </button>
                </div>
              )}
            </section>
          )}

          {isInvoice && inv.status !== "annulee" && (
            <section className="card">
              <h2>Corriger ou annuler</h2>
              <p className="muted">Une facture émise ne se modifie pas. Pour l'annuler ou la corriger, faites un avoir.</p>
              {inv.credit_notes.length > 0 && (
                <p>Avoirs : {inv.credit_notes.map((n) => (
                  <Link key={n.id} to={`/factures/${n.id}`} className="chip-link">{n.number ?? "brouillon"} ({formatEuro(n.total_ttc)})</Link>
                ))}</p>
              )}
              <button className="btn btn-ghost" disabled={busy}
                      onClick={() => act(async () => {
                        const note = await api.post<InvoiceFull>(`/api/invoices/${inv.id}/credit-note`, {});
                        navigate(`/factures/${note.id}`);
                      })}>
                Créer un avoir (modifiable avant émission)
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
