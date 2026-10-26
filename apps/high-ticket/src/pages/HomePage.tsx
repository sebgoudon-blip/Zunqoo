import { Link } from "react-router-dom";
import { MODULES } from "../content/modules";
import { useAppState } from "../state";

export function HomePage() {
  const { profile } = useAppState();
  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Shopify × Google Shopping</p>
        <h1>Lance ta boutique high-ticket, une micro-tâche à la fois.</h1>
        <p className="lead">
          Un coach pas-à-pas qui t'emmène de la structure légale à ta première campagne Google Ads rentable, avec les
          calculateurs, la checklist Merchant Center et les pages légales générées pour toi.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary btn-large" to={profile ? "/parcours" : "/profil"}>
            {profile ? "Reprendre mon parcours" : "Commencer gratuitement"}
          </Link>
          <Link className="btn btn-ghost btn-large" to="/outils">
            Voir les outils
          </Link>
        </div>
      </section>

      <section className="rules">
        <div className="rule">
          <strong>Une tâche à la fois</strong>
          <span>Jamais de cours magistral : une action concrète, tu la fais, tu valides.</span>
        </div>
        <div className="rule">
          <strong>Tu peux sauter</strong>
          <span>Une étape ne te concerne pas ? « Sauter », et on avance.</span>
        </div>
        <div className="rule">
          <strong>Budget serré</strong>
          <span>Pensé pour démarrer avec environ 1 000 € : essais gratuits et dépenses indispensables uniquement.</span>
        </div>
      </section>

      <section>
        <h2>Les 7 modules</h2>
        <ol className="module-list">
          {MODULES.map((m) => (
            <li key={m.id}>
              <span className="module-num">{m.number}</span>
              <div>
                <strong>{m.title}</strong>
                <p>{m.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
