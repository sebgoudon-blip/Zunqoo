import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { ErrorBanner, Icon } from "../ui";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={onSubmit}>
        <span className="brand-mark large" aria-hidden="true">Z</span>
        <h1>Espace de gestion</h1>
        <p className="intro">Connectez-vous pour suivre vos appels, vos clients et vos validations.</p>
        <ErrorBanner message={error} />
        <label className="field">
          <span>Adresse e-mail</span>
          <input type="email" autoComplete="email" required value={email}
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" autoComplete="current-password" required value={password}
                 onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          <Icon name="lock" />
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
