import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Dashboard } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import { CHANNEL_ICON, EmptyState, ErrorBanner, Icon, PageHeader, Spinner } from "../ui";

export function DashboardPage() {
  const { me, hasModule } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  const firstName = me?.user.name.split(" ")[0];
  return (
    <>
      <PageHeader title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
                  intro="Voici ce qui s'est passé récemment." />
      <ErrorBanner message={error} />
      {!data && !error && <Spinner />}
      {data && (
        <>
          <section className="stats" aria-label="Chiffres clés">
            <Link to="/a-valider" className={`stat ${data.pending_approvals ? "stat-alert" : ""}`}>
              <span className="stat-value">{data.pending_approvals}</span>
              <span className="stat-label">à valider</span>
            </Link>
            {hasModule("telephone") && (
              <div className="stat">
                <span className="stat-value">{data.calls_24h}</span>
                <span className="stat-label">appels en 24 h</span>
              </div>
            )}
            {hasModule("commandes") && (
              <div className="stat">
                <span className="stat-value">{data.orders_7d}</span>
                <span className="stat-label">commandes en 7 jours</span>
              </div>
            )}
            <Link to="/clients" className="stat">
              <span className="stat-value">{data.contacts}</span>
              <span className="stat-label">clients</span>
            </Link>
          </section>

          <section className="card">
            <h2>Activité récente</h2>
            {data.recent.length === 0 ? (
              <EmptyState icon="phone" title="Rien pour l'instant">
                Les appels et messages traités par l'assistant apparaîtront ici.
              </EmptyState>
            ) : (
              <ul className="timeline">
                {data.recent.map((i) => (
                  <li key={i.id}>
                    <span className={`chan chan-${i.channel}`}>
                      <Icon name={CHANNEL_ICON[i.channel] ?? "note"} size={16} />
                    </span>
                    <div>
                      <div className="timeline-head">
                        <strong>{i.title}</strong>
                        <time dateTime={i.occurred_at}>{formatWhen(i.occurred_at)}</time>
                      </div>
                      {i.contact && <Link to={`/clients/${i.contact.id}`}>{i.contact.name}</Link>}
                      {i.summary && <p>{i.summary}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
