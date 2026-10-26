import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon, Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";
import { auditShop, disconnectShopify, startShopifyConnect, type ShopAudit } from "../lib/api";
import { errorMessage } from "../lib/cloudConfig";
import { useAppState } from "../state";

const RETURN_MESSAGES: Record<string, { tone: "good" | "warn" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Boutique connectée. Lance l'audit pour vérifier ta conformité." },
  invalid: { tone: "bad", text: "La réponse de Shopify n'a pas pu être vérifiée. Réessaie la connexion." },
  expired: { tone: "warn", text: "La demande de connexion a expiré. Recommence depuis cette page." },
  error: { tone: "bad", text: "La connexion à Shopify a échoué. Réessaie dans quelques minutes." },
};

export function ShopPage() {
  const { cloudEnabled, user, shopify } = useAuth();
  const { profile } = useAppState();
  const [params] = useSearchParams();
  const [shopInput, setShopInput] = useState("");
  const [busy, setBusy] = useState<"connect" | "audit" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useStoredState<ShopAudit | null>("shop_audit", null);
  const returned = RETURN_MESSAGES[params.get("shopify") ?? ""];

  if (!cloudEnabled || !user) {
    return (
      <div className="page narrow">
        <h1>Ma boutique Shopify</h1>
        <p>
          Connecte ta boutique pour publier tes pages légales en un clic et vérifier automatiquement les points
          contrôlés par Google Merchant Center.
        </p>
        {cloudEnabled ? (
          <Link className="btn btn-primary btn-large" to="/compte">
            Me connecter pour continuer <Icon name="arrow" />
          </Link>
        ) : (
          <div className="notice">Le mode cloud n'est pas configuré sur cette installation.</div>
        )}
      </div>
    );
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("connect");
    try {
      const { url } = await startShopifyConnect({ shop: shopInput });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function runAudit() {
    setError(null);
    setBusy("audit");
    try {
      setAudit(await auditShop({ address: profile?.address }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Déconnecter ta boutique ? Pour retirer complètement l'accès, désinstalle aussi l'app dans ton admin Shopify.")) return;
    setBusy("disconnect");
    try {
      await disconnectShopify({});
      setAudit(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const failing = audit?.checks.filter((c) => c.status !== "ok").length ?? 0;

  return (
    <div className="page narrow">
      <h1>Ma boutique Shopify</h1>
      {returned && <Verdict tone={returned.tone}>{returned.text}</Verdict>}

      {!shopify ? (
        <form className="card stack" onSubmit={connect}>
          <p>
            HighTicket Pilot demande uniquement : la lecture des produits et des pages, et l'écriture des politiques
            légales. Il ne touche ni à tes commandes, ni à tes clients, ni à tes paiements.
          </p>
          <label className="field">
            <span>Adresse de ta boutique</span>
            <input
              value={shopInput}
              required
              placeholder="ma-boutique.myshopify.com"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setShopInput(e.target.value)}
            />
            <small>Elle s'affiche dans Shopify, en haut de Paramètres &gt; Domaines.</small>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-large" type="submit" disabled={busy === "connect"}>
            {busy === "connect" ? "Redirection vers Shopify…" : "Connecter ma boutique"}
          </button>
        </form>
      ) : (
        <div className="stack">
          <div className="card shop-head">
            <div>
              <span className="meta-label">Boutique connectée</span>
              <strong>{audit?.shop ?? shopify.shop}</strong>
              <small className="muted">{audit?.domain ?? shopify.shop}</small>
            </div>
            <div className="answer-buttons">
              <button className="btn btn-primary" type="button" onClick={runAudit} disabled={busy === "audit"}>
                {busy === "audit" ? "Audit en cours…" : audit ? "Relancer l'audit" : "Lancer l'audit"}
              </button>
              <Link className="btn btn-ghost" to="/outils/legal">
                Publier mes pages légales
              </Link>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {audit && (
            <div className="card">
              <h3>Audit de conformité</h3>
              {failing === 0 ? (
                <Verdict tone="good">Tous les points vérifiables automatiquement sont conformes.</Verdict>
              ) : (
                <Verdict tone="warn">{failing} point(s) à corriger ou à vérifier avant de soumettre Merchant Center.</Verdict>
              )}
              <ul className="audit-list">
                {audit.checks.map((c) => (
                  <li key={c.id} className={c.status}>
                    <Icon name={c.status === "ok" ? "good" : c.status === "ko" ? "bad" : "help"} />
                    <div>
                      <strong>{c.label}</strong>
                      <span className="sr-only">{c.status === "ok" ? " : conforme" : c.status === "ko" ? " : à corriger" : " : à vérifier"}</span>
                      <small>{c.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
              <small className="muted">
                Vérifié le {new Date(audit.checkedAt).toLocaleString("fr-FR")}. Les résultats cochent aussi la{" "}
                <Link to="/outils/gmc">checklist Merchant Center</Link>.
              </small>
            </div>
          )}

          <button className="link-btn" type="button" onClick={disconnect} disabled={busy === "disconnect"}>
            Déconnecter cette boutique
          </button>
        </div>
      )}
    </div>
  );
}
