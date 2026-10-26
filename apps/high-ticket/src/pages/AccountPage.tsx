import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth";
import { Icon } from "../components/Icon";

const SYNC_LABELS = {
  idle: "Non synchronisé",
  syncing: "Synchronisation…",
  synced: "À jour sur tous tes appareils",
  error: "Erreur de synchronisation : tes modifications restent sur cet appareil.",
};

export function AccountPage() {
  const auth = useAuth();

  if (!auth.cloudEnabled) {
    return (
      <div className="page narrow">
        <h1>Compte</h1>
        <div className="notice">
          Le mode cloud n'est pas configuré sur cette installation : ta progression est enregistrée uniquement dans ce
          navigateur. Voir <code>apps/high-ticket/README.md</code> pour l'activer.
        </div>
      </div>
    );
  }

  if (auth.user === undefined) {
    return <div className="page narrow muted">Chargement…</div>;
  }

  if (auth.user) {
    const user = auth.user;
    return (
      <div className="page narrow">
        <h1>Mon compte</h1>
        <div className="card stack">
          <div>
            <span className="meta-label">Connecté en tant que</span>
            <strong>{user.email ?? user.displayName}</strong>
          </div>
          <p className={`sync ${auth.syncStatus}`} role="status">
            <Icon name={auth.syncStatus === "error" ? "warn" : "good"} />
            {SYNC_LABELS[auth.syncStatus]}
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary" to="/parcours">
              Reprendre mon parcours <Icon name="arrow" />
            </Link>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                if (window.confirm("Te déconnecter ? Tes données restent dans ton compte, mais sont retirées de cet appareil.")) {
                  void auth.signOut();
                }
              }}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <SignInForm />;
}

function SignInForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password.length < 8) {
      setError("Mot de passe trop court : 8 caractères minimum.");
      return;
    }
    void run(() => (mode === "signin" ? auth.signInWithEmail(email, password) : auth.signUpWithEmail(email, password)));
  }

  return (
    <div className="page narrow">
      <h1>{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>
      <p>
        Avec un compte, ta progression est sauvegardée et synchronisée sur tous tes appareils, et tu débloques
        l'assistant IA, la relecture des pages légales et la connexion à ta boutique Shopify. Ce que tu as déjà fait sur
        cet appareil est conservé.
      </p>
      <div className="card stack">
        <button className="btn btn-ghost btn-large" type="button" disabled={busy} onClick={() => run(auth.signInWithGoogle)}>
          Continuer avec Google
        </button>
        <div className="divider">
          <span>ou</span>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <small>8 caractères minimum.</small>}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="form-info" role="status">
              {info}
            </p>
          )}
          <button className="btn btn-primary btn-large full" type="submit" disabled={busy}>
            {mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                if (!email) {
                  setError("Indique ton email ci-dessus, puis clique à nouveau.");
                  return;
                }
                void run(async () => {
                  await auth.resetPassword(email);
                  setInfo("Email de réinitialisation envoyé, si un compte existe à cette adresse.");
                });
              }}
            >
              Mot de passe oublié ?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
