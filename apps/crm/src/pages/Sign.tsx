import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiUrl, type PublicQuote } from "../api";
import { formatEuro } from "../format";
import { SignaturePad, type SignaturePadHandle } from "../SignaturePad";
import { ErrorBanner, Icon, Spinner } from "../ui";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function qty(n: number) {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

/** Signature « écrite » : le nom tapé, rendu en écriture manuscrite. */
function typedSignature(name: string): string {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 240;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1f1a17";
  ctx.textBaseline = "middle";
  let size = 96;
  do {
    ctx.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
    size -= 4;
  } while (ctx.measureText(name).width > 840 && size > 30);
  ctx.fillText(name, 30, 125);
  return c.toDataURL("image/png");
}

export function SignPage() {
  const { token = "" } = useParams();
  const base = `/api/public/signature/${token}`;
  const [data, setData] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => api.get<PublicQuote>(base).then((d) => { setData(d); setName((n) => n || d.quote.client || ""); })
    .catch((e) => setLoadError(e.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [mode, setMode] = useState<"dessin" | "texte">("dessin");
  const [hasInk, setHasInk] = useState(false);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const pad = useRef<SignaturePadHandle>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message.charAt(0).toUpperCase() + e.message.slice(1) : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <SignShell>
        <section className="card sign-state">
          <Icon name="lock" size={32} />
          <h1>Lien de signature invalide</h1>
          <p className="muted">Ce lien n'est pas reconnu. Vérifiez qu'il est complet, ou demandez un nouveau lien au commerce.</p>
        </section>
      </SignShell>
    );
  }
  if (!data) return <SignShell><Spinner /></SignShell>;

  const { business, quote, signature } = data;
  const needsCode = signature.otp_required && !signature.otp_verified;
  const ready = !needsCode && name.trim().length >= 3 && accept && (mode === "texte" ? name.trim().length >= 3 : hasInk);

  async function submit() {
    const image = mode === "texte" ? typedSignature(name.trim()) : pad.current?.toDataURL();
    if (!image) { setError("Tracez votre signature dans le cadre."); return; }
    await run(async () => {
      await api.post(`${base}/sign`, { name: name.trim(), role: role.trim() || null, signature: image, accept });
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <SignShell business={business}>
      {signature.status === "signe" && (
        <section className="card sign-state sign-done" role="status">
          <span className="sign-check" aria-hidden="true"><Icon name="check" size={28} /></span>
          <h1>Merci, votre devis est signé</h1>
          <p>
            Signé par <strong>{signature.signer_name}</strong>
            {signature.signed_at && <> le {dateTimeFmt.format(new Date(signature.signed_at))}</>}.
            {" "}{business.name} a été prévenu{signature.email ? " et vous recevez votre exemplaire par e-mail" : ""}.
          </p>
          <a className="btn btn-primary" href={apiUrl(`${base}/document.pdf`)} target="_blank" rel="noopener">
            <Icon name="download" size={18} />Mon exemplaire signé (PDF)
          </a>
        </section>
      )}
      {signature.status === "refuse" && (
        <section className="card sign-state" role="status">
          <h1>Devis refusé</h1>
          <p className="muted">Votre réponse a bien été transmise à {business.name}. Merci d'avoir pris le temps de répondre.</p>
        </section>
      )}
      {signature.closed && (
        <section className="card sign-state" role="status">
          <h1>Signature indisponible</h1>
          <p className="muted">{signature.closed.charAt(0).toUpperCase() + signature.closed.slice(1)}{business.phone ? ` (${business.phone}).` : "."}</p>
        </section>
      )}

      <section className="card sign-quote" aria-labelledby="q-title">
        <p className="sign-kicker">Devis n° {quote.number}</p>
        <h1 id="q-title">{quote.title}</h1>
        <p className="muted">
          {quote.client && <>Pour {quote.client} · </>}émis le {dateFmt.format(new Date(quote.issue_date))}
          {quote.valid_until && <> · valable jusqu'au {dateFmt.format(new Date(quote.valid_until))}</>}
        </p>
        <ul className="sign-lines">
          {quote.lines.map((l, i) => (
            <li key={i}>
              <div>
                <strong>{l.description}</strong>
                {l.detail && <span className="muted"> — {l.detail}</span>}
                <span className="muted sign-line-qty">{qty(l.quantity)}{l.unit ? ` ${l.unit}` : ""} × {formatEuro(l.unit_price)}</span>
              </div>
              <span className="nowrap">{formatEuro(l.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="sign-totals">
          {!quote.vat_franchise && <>
            <div><dt>Total HT</dt><dd>{formatEuro(quote.total_ht)}</dd></div>
            <div><dt>TVA</dt><dd>{formatEuro(quote.total_vat)}</dd></div>
          </>}
          <div className="sign-total"><dt>Total TTC</dt><dd>{formatEuro(quote.total_ttc)}</dd></div>
        </dl>
        {quote.notes && <p className="sign-notes">{quote.notes}</p>}
        <a className="btn btn-ghost" href={apiUrl(`${base}/document.pdf`)} target="_blank" rel="noopener">
          <Icon name="note" size={18} />Voir le devis complet (PDF)
        </a>
      </section>

      {signature.status === "ouvert" && !signature.closed && (
        <section className="card sign-form" aria-labelledby="s-title">
          <h2 id="s-title">Accepter et signer</h2>
          <ErrorBanner message={error} />

          {needsCode && (
            <div className="sign-step">
              <h3><span className="step-num">1</span>Confirmez votre adresse e-mail</h3>
              <p className="muted">Nous envoyons un code à 6 chiffres à <strong>{signature.email}</strong>, l'adresse à laquelle le devis vous a été envoyé.</p>
              {!codeSentTo ? (
                <button className="btn btn-primary" disabled={busy}
                        onClick={() => run(async () => setCodeSentTo((await api.post<{ sent_to: string }>(`${base}/code`)).sent_to))}>
                  Recevoir mon code
                </button>
              ) : (
                <form className="code-row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post(`${base}/code/verify`, { code }); await load(); }); }}>
                  <label className="field">
                    <span>Code reçu par e-mail</span>
                    <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                           inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className="code-input" />
                  </label>
                  <button className="btn btn-primary" disabled={busy || code.length !== 6}>Valider</button>
                  <button type="button" className="link" disabled={busy}
                          onClick={() => run(async () => { await api.post(`${base}/code`); setCode(""); })}>Renvoyer un code</button>
                </form>
              )}
            </div>
          )}

          <fieldset className="sign-step" disabled={needsCode}>
            <h3><span className="step-num">{signature.otp_required ? 2 : 1}</span>Votre signature</h3>
            <div className="form-grid">
              <label className="field"><span>Nom et prénom</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
              <label className="field"><span>Fonction <span className="muted">(si vous signez pour une société)</span></span>
                <input value={role} onChange={(e) => setRole(e.target.value)} autoComplete="organization-title" /></label>
            </div>
            <div className="sig-mode" role="radiogroup" aria-label="Façon de signer">
              <button type="button" role="radio" aria-checked={mode === "dessin"} className={mode === "dessin" ? "on" : ""} onClick={() => setMode("dessin")}>Dessiner</button>
              <button type="button" role="radio" aria-checked={mode === "texte"} className={mode === "texte" ? "on" : ""} onClick={() => setMode("texte")}>Écrire mon nom</button>
            </div>
            {mode === "dessin" ? (
              <>
                <SignaturePad ref={pad} onChange={setHasInk} label="Zone de signature" />
                <button type="button" className="link" onClick={() => pad.current?.clear()}>Effacer et recommencer</button>
              </>
            ) : (
              <div className="typed-signature" aria-live="polite">{name.trim() || "Votre nom"}</div>
            )}
            <label className="check sign-accept">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>{signature.mention}</span>
            </label>
            <button className="btn btn-primary btn-large" disabled={busy || !ready} onClick={submit}>
              <Icon name="check" />Signer le devis
            </button>
          </fieldset>

          <div className="sign-refuse">
            {!refusing ? (
              <button className="link" onClick={() => setRefusing(true)}>Je ne souhaite pas accepter ce devis</button>
            ) : (
              <div>
                <label className="field"><span>Un mot pour {business.name} ? <span className="muted">(facultatif)</span></span>
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <div className="presets">
                  <button className="btn btn-ghost" onClick={() => setRefusing(false)}>Annuler</button>
                  <button className="btn btn-danger" disabled={busy}
                          onClick={() => run(async () => { await api.post(`${base}/refuse`, { reason: reason || null }); await load(); })}>
                    Refuser le devis
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="sign-legal">
        Signature électronique conforme au règlement européen eIDAS. Votre nom, votre signature, l'adresse
        e-mail vérifiée, la date, l'adresse IP et le navigateur utilisés sont conservés
        par {business.legal_name || business.name} comme preuve de votre accord.
      </p>
    </SignShell>
  );
}

function SignShell({ business, children }: { business?: PublicQuote["business"]; children: React.ReactNode }) {
  useEffect(() => {
    document.title = business ? `Devis – ${business.name}` : "Signature du devis";
  }, [business]);
  return (
    <div className="sign-page">
      <header className="sign-header">
        <span className="brand-mark" aria-hidden="true">{business?.name.charAt(0).toUpperCase() ?? "Z"}</span>
        <div>
          <strong>{business?.name ?? "Signature du devis"}</strong>
          {business && <span>{[business.city, business.phone].filter(Boolean).join(" · ")}</span>}
        </div>
      </header>
      <main className="sign-main">{children}</main>
      <footer className="sign-footer"><Icon name="lock" size={14} />Signature sécurisée · Zunqoo</footer>
    </div>
  );
}
