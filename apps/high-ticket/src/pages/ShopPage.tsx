import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { AuditReport } from "../components/AuditReport";
import { Icon, Verdict } from "../components/Icon";
import { useStoredState } from "../hooks/useStoredState";
import { auditShop, disconnectShopify, isCurrentReport, startShopifyConnect, type AuditReport as Report } from "../lib/api";
import { SAMPLE_SNAPSHOT, runAudit as auditSnapshot } from "../lib/audit";
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
  const [stored, setAudit] = useStoredState<Report | null>("shop_audit", null);
  const audit = isCurrentReport(stored) ? stored : null;
  const showSample = params.has("exemple");
  const sample = useMemo(() => (showSample ? auditSnapshot(SAMPLE_SNAPSHOT) : null), [showSample]);
  const returned = RETURN_MESSAGES[params.get("shopify") ?? ""];

  if (sample) {
    return (
      <div className="page narrow">
        <h1>Exemple de rapport d'audit</h1>
        <p className="sample-banner">
          <Icon name="help" />
          <span>
            Boutique <strong>fictive</strong>, créée pour montrer le rapport : les problèmes sont volontaires.{" "}
            <Link to="/boutique">Revenir à ma boutique</Link>
          </span>
        </p>
        <AuditReport report={sample} sample />
      </div>
    );
  }

  if (!cloudEnabled || !user) {
    return (
      <div className="page narrow">
        <h1>Ma boutique Shopify</h1>
        <p>
          Connecte ta boutique pour lancer un audit de conformité Google Merchant Center : score sur 100, points classés
          par gravité, et pour chacun la raison et la correction.
        </p>
        {cloudEnabled ? (
          <Link className="btn btn-primary btn-large" to="/compte">
            Me connecter pour continuer <Icon name="arrow" />
          </Link>
        ) : (
          <div className="notice">Le mode cloud n'est pas configuré sur cette installation.</div>
        )}
        <Link className="btn btn-ghost" to="/boutique?exemple">
          Voir un exemple de rapport
        </Link>
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

  return (
    <div className="page narrow">
      <h1>Ma boutique Shopify</h1>
      {returned && <Verdict tone={returned.tone}>{returned.text}</Verdict>}

      {!shopify ? (
        <form className="card stack" onSubmit={connect}>
          <p>
            L'audit demande uniquement un accès <strong>en lecture</strong> : produits, pages et politiques. Il ne modifie
            rien et ne voit ni tes commandes, ni tes clients, ni tes paiements.
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

          {audit ? (
            <>
              <AuditReport report={audit} />
              <small className="muted">
                Les résultats cochent aussi la <Link to="/outils/gmc">checklist Merchant Center</Link>.
              </small>
            </>
          ) : (
            <p className="muted">
              L'audit prend environ une minute. <Link to="/boutique?exemple">Voir un exemple de rapport</Link>
            </p>
          )}

          <button className="link-btn" type="button" onClick={disconnect} disabled={busy === "disconnect"}>
            Déconnecter cette boutique
          </button>
        </div>
      )}
    </div>
  );
}
