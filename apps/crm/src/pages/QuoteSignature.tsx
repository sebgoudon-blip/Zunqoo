import { useEffect, useState } from "react";
import { api, type QuoteFull, type QuoteSignatureInfo } from "../api";
import { ErrorBanner, Icon } from "../ui";

const dt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const d = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/** Signature en ligne du devis : lien à partager, suivi, dossier de preuve. */
export function QuoteSignatureCard({ quote }: { quote: QuoteFull }) {
  const [sig, setSig] = useState<QuoteSignatureInfo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<{ signature: QuoteSignatureInfo | null }>(`/api/quotes/${quote.id}/signature`)
      .then((r) => setSig(r.signature)).catch((e) => setError(e.message));
  }, [quote.id, quote.status]);

  if (sig === undefined) return error ? <ErrorBanner message={error} /> : null;
  if (sig === null && quote.status !== "envoye") return null;

  async function createLink() {
    try {
      setSig((await api.post<{ signature: QuoteSignatureInfo }>(`/api/quotes/${quote.id}/signature`)).signature);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lien indisponible.");
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copie impossible : sélectionnez le lien et copiez-le.");
    }
  }

  const first = quote.contact?.name.split(" ")[0];
  const shareText = (url: string) =>
    `Bonjour${first ? " " + first : ""}, voici votre devis « ${quote.title} » à signer en ligne : ${url}`;

  return (
    <section className="card" aria-labelledby="sig-title">
      <div className="card-head">
        <h2 id="sig-title">Signature en ligne</h2>
        {sig?.status === "signe" && <span className="pill pill-signed">Signé</span>}
        {sig?.status === "ouvert" && <span className="pill pill-a_valider">{sig.viewed ? "Consulté, pas encore signé" : "Pas encore ouvert"}</span>}
        {sig?.status === "refuse" && <span className="pill pill-refuse">Refusé en ligne</span>}
      </div>
      <ErrorBanner message={error} />

      {sig === null && (
        <>
          <p className="muted">Le client peut signer ce devis depuis son téléphone. Créez le lien, puis envoyez-le par SMS ou WhatsApp.</p>
          <button className="btn btn-primary" onClick={createLink}>Créer le lien de signature</button>
        </>
      )}

      {sig?.status === "ouvert" && sig.url && (
        <>
          <p className="muted">
            Lien personnel du client{sig.expires_at && <>, valable jusqu'au {d.format(new Date(sig.expires_at))}</>}.
            {sig.otp_required ? " Il confirmera son identité avec un code reçu par e-mail." : " Sans e-mail connu, la signature se fait sans code de vérification."}
          </p>
          <div className="sig-link">
            <label className="visually-hidden" htmlFor="sig-url">Lien de signature</label>
            <input id="sig-url" readOnly value={sig.url} onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost" onClick={() => copy(sig.url!)}>{copied ? "Copié !" : "Copier"}</button>
          </div>
          <div className="presets">
            <a className="btn btn-ghost btn-small" href={`https://wa.me/?text=${encodeURIComponent(shareText(sig.url))}`} target="_blank" rel="noopener">
              <Icon name="message" size={16} />Envoyer par WhatsApp
            </a>
            <a className="btn btn-ghost btn-small" href={`sms:?&body=${encodeURIComponent(shareText(sig.url))}`}>
              <Icon name="phone" size={16} />Par SMS
            </a>
          </div>
        </>
      )}

      {sig?.status === "signe" && (
        <>
          <p>
            Signé par <strong>{sig.signer_name}</strong>{sig.signer_role && <> ({sig.signer_role})</>}
            {sig.signed_at && <> le {dt.format(new Date(sig.signed_at))}</>}
            {sig.signer_email ? <> · e-mail vérifié : {sig.signer_email}</> : <> · sans vérification par e-mail</>}.
          </p>
          <button className="btn btn-primary"
                  onClick={() => api.openPdf(`/api/quotes/${quote.id}/signed.pdf`).catch((e) => setError(e.message))}>
            <Icon name="download" size={18} />Devis signé + certificat (PDF)
          </button>
        </>
      )}

      {sig?.status === "refuse" && (
        <p>Le client a refusé le devis en ligne{sig.refusal_reason ? <> : « {sig.refusal_reason} »</> : "."}</p>
      )}

      {sig && sig.events.length > 0 && (
        <details>
          <summary>Dossier de preuve</summary>
          <ul className="timeline">
            {sig.events.map((e, i) => (
              <li key={i}><time dateTime={e.at}>{dt.format(new Date(e.at))}</time><span>{e.label}{e.ip ? ` · IP ${e.ip}` : ""}</span></li>
            ))}
          </ul>
          <p className="hash">Empreinte du devis présenté (SHA-256) : {sig.document_sha256}</p>
          {sig.signed_pdf_sha256 && <p className="hash">Empreinte du PDF signé (SHA-256) : {sig.signed_pdf_sha256}</p>}
          <p className="muted">Ces éléments sont conservés sans limite de durée avec le devis.</p>
        </details>
      )}
    </section>
  );
}
