import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { MODULES } from "../content/modules";
import { useAppState } from "../state";

const RULES: { icon: IconName; title: string; text: string }[] = [
  { icon: "target", title: "Une tâche à la fois", text: "Jamais de cours magistral : une action concrète, tu la fais, tu valides." },
  { icon: "skip", title: "Tu peux sauter", text: "Une étape ne te concerne pas ? « Sauter », et on avance." },
  { icon: "coins", title: "Budget serré", text: "Pensé pour démarrer avec environ 1 000 € : essais gratuits et dépenses indispensables uniquement." },
];

export function HomePage() {
  const { profile } = useAppState();
  const cta = (
    <Link className="btn btn-primary btn-large" to={profile ? "/parcours" : "/profil"}>
      {profile ? "Reprendre mon parcours" : "Commencer gratuitement"}
      <Icon name="arrow" />
    </Link>
  );

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
          {cta}
          <Link className="btn btn-ghost btn-large" to="/outils">
            Voir les outils
          </Link>
        </div>
        <ul className="hero-proof">
          <li>
            <Icon name="check" size={16} /> 7 modules, ~40 micro-tâches
          </li>
          <li>
            <Icon name="check" size={16} /> 5 outils intégrés
          </li>
          <li>
            <Icon name="check" size={16} /> Gratuit, sans inscription
          </li>
        </ul>
      </section>

      <section className="rules" aria-label="Comment ça marche">
        {RULES.map((r) => (
          <div className="rule" key={r.title}>
            <span className="rule-icon">
              <Icon name={r.icon} size={20} />
            </span>
            <strong>{r.title}</strong>
            <span>{r.text}</span>
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Les 7 modules</h2>
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

      <section className="final-cta">
        <h2>Prêt à valider ta première tâche ?</h2>
        <p>Moins de 15 minutes pour la tâche 1.1. Ta progression est enregistrée automatiquement.</p>
        {cta}
      </section>
    </div>
  );
}
