import { useEffect, useState, type FormEvent } from "react";
import { api, type BusinessInfo } from "../api";
import { ErrorBanner } from "../ui";

type Field = { key: keyof BusinessInfo; label: string; hint?: string; type?: string; wide?: boolean };

const FIELDS: Field[] = [
  { key: "legal_name", label: "Raison sociale", wide: true },
  { key: "legal_form", label: "Forme juridique", hint: "EI, SARL, SAS…" },
  { key: "capital", label: "Capital social", hint: "Ex. : 5 000 €" },
  { key: "address", label: "Adresse", wide: true },
  { key: "postal_code", label: "Code postal" },
  { key: "city", label: "Ville" },
  { key: "siret", label: "SIRET", hint: "14 chiffres" },
  { key: "vat_number", label: "N° de TVA intracommunautaire", hint: "FR + 11 caractères" },
  { key: "rcs", label: "RCS / RM", hint: "Ex. : RCS Romans 123 456 789" },
  { key: "phone", label: "Téléphone" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "iban", label: "IBAN (pour les factures)" },
  { key: "bic", label: "BIC" },
];

export function BusinessForm({ isAdmin }: { isAdmin: boolean }) {
  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean | number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<BusinessInfo>("/api/business").then((b) => {
      setInfo(b);
      setForm(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ""])) as Record<string, string>);
    }).catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const body: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = String(form[f.key] ?? "").trim();
      body[f.key] = v === "" ? null : f.key === "siret" || f.key === "vat_number" || f.key === "iban"
        ? v.replace(/\s/g, "").toUpperCase() : v;
    }
    body.vat_franchise = Boolean(form.vat_franchise);
    body.quote_validity_days = Number(form.quote_validity_days) || 30;
    body.payment_terms_days = Number(form.payment_terms_days) || 0;
    body.quote_terms = String(form.quote_terms ?? "").trim() || null;
    try {
      setInfo(await api.patch<BusinessInfo>("/api/business", body));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith("Certaines")
        ? "Vérifiez le format : SIRET (14 chiffres), code postal (5 chiffres), TVA (FR…), IBAN."
        : err instanceof Error ? err.message : "Enregistrement impossible.");
    }
  }

  if (!info) return error ? <ErrorBanner message={error} /> : null;
  return (
    <section className="card" id="entreprise">
      <h2>Informations de l'entreprise</h2>
      <p className="muted">Elles apparaissent sur vos devis et factures. Les mentions obligatoires doivent être complètes avant tout envoi.</p>
      {info.missing.length > 0 && (
        <div className="banner" role="note">À compléter : {info.missing.join(", ")}.</div>
      )}
      <ErrorBanner message={error} />
      {saved && <div className="banner banner-ok" role="status">Informations enregistrées.</div>}
      <form className="form-grid" onSubmit={onSubmit}>
        {FIELDS.map((f) => (
          <label key={f.key} className={`field ${f.wide ? "span-2" : ""}`}>
            <span>{f.label}</span>
            <input type={f.type ?? "text"} value={String(form[f.key] ?? "")} placeholder={f.hint}
                   disabled={!isAdmin} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </label>
        ))}
        <label className="field span-2 checkbox">
          <input type="checkbox" checked={Boolean(form.vat_franchise)} disabled={!isAdmin}
                 onChange={(e) => setForm({ ...form, vat_franchise: e.target.checked })} />
          <span>Franchise en base de TVA (pas de TVA facturée — art. 293 B du CGI)</span>
        </label>
        <label className="field">
          <span>Validité des devis (jours)</span>
          <input type="number" min={1} max={365} value={String(form.quote_validity_days ?? 30)} disabled={!isAdmin}
                 onChange={(e) => setForm({ ...form, quote_validity_days: e.target.value })} />
        </label>
        <label className="field">
          <span>Délai de paiement des factures (jours)</span>
          <input type="number" min={0} max={60} value={String(form.payment_terms_days ?? 30)} disabled={!isAdmin}
                 onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} />
        </label>
        <label className="field span-2">
          <span>Conditions affichées sur les devis</span>
          <textarea rows={2} value={String(form.quote_terms ?? "")} disabled={!isAdmin}
                    placeholder="Ex. : acompte de 30 % à la commande, solde au retrait."
                    onChange={(e) => setForm({ ...form, quote_terms: e.target.value })} />
        </label>
        {isAdmin && <div className="form-actions"><button className="btn btn-primary">Enregistrer</button></div>}
      </form>
    </section>
  );
}
