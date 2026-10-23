import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Dashboard, type OrderLineOut, type Today, type UpcomingOrder } from "../api";
import { useAuth } from "../auth";
import { formatEuro, formatPhone, formatWhen } from "../format";
import { CHANNEL_ICON, ErrorBanner, Icon, Spinner } from "../ui";

function qty(l: OrderLineOut): string {
  const n = Number.isInteger(l.quantity) ? String(l.quantity) : String(l.quantity).replace(".", ",");
  return `${n}${l.unit ? ` ${l.unit}` : ""} ${l.product}`;
}

export function DashboardPage() {
  const { me } = useAuth();
  const [today, setToday] = useState<Today | null>(null);
  const [recent, setRecent] = useState<Dashboard["recent"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Today>("/api/today").then(setToday).catch((e) => setError(e.message));
    api.get<Dashboard>("/api/dashboard").then((d) => setRecent(d.recent)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000); // la journée se met à jour toute seule
    return () => window.clearInterval(timer);
  }, [load]);

  async function markDone(id: string) {
    setError(null);
    try {
      await api.post(`/api/interactions/${id}/handled`, { done: true });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  const firstName = me?.user.name.split(" ")[0];
  if (!today) return error ? <ErrorBanner message={error} /> : <Spinner />;

  const { todo, orders } = today;
  const nothingToDo = todo.approvals_count === 0 && todo.callbacks.length === 0;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{today.date_label}</p>
          <h1>{firstName ? `Bonjour ${firstName}` : "Bonjour"}</h1>
        </div>
      </header>
      <ErrorBanner message={error} />

      <section className="stats" aria-label="Aujourd'hui">
        <Link to="/a-valider" className={`stat ${todo.approvals_count ? "stat-alert" : ""}`}>
          <span className="stat-value">{todo.approvals_count}</span>
          <span className="stat-label">à valider</span>
        </Link>
        {today.today.calls !== null && (
          <div className="stat">
            <span className="stat-value">{today.today.calls}</span>
            <span className="stat-label">appels aujourd'hui</span>
          </div>
        )}
        {today.today.orders !== null && (
          <div className="stat">
            <span className="stat-value">{today.today.orders}</span>
            <span className="stat-label">commandes prises aujourd'hui</span>
          </div>
        )}
        {today.today.emails !== null && (
          <div className="stat">
            <span className="stat-value">{today.today.emails}</span>
            <span className="stat-label">
              e-mails traités{today.today.emails_auto ? ` · dont ${today.today.emails_auto} répondu(s) seul(s)` : ""}
            </span>
          </div>
        )}
        <div className="stat">
          <span className="stat-value">{today.today.new_contacts}</span>
          <span className="stat-label">nouveaux clients</span>
        </div>
      </section>

      <div className="day-grid">
        <section className="card" aria-labelledby="todo-title">
          <h2 id="todo-title">À faire maintenant</h2>
          {nothingToDo ? (
            <p className="all-good">
              <Icon name="checkCircle" />
              Tout est à jour, rien ne vous attend.
            </p>
          ) : (
            <ul className="todo-list">
              {todo.approvals.map((a) => (
                <li key={a.id}>
                  <span className="todo-kind kind-approval">À valider</span>
                  <div className="todo-main">
                    <strong>{a.title}</strong>
                    <span className="muted clamp">{a.summary}</span>
                  </div>
                  <Link className="btn btn-small btn-primary" to={`/a-valider?id=${a.id}`}>Voir</Link>
                </li>
              ))}
              {todo.approvals_count > todo.approvals.length && (
                <li className="todo-more">
                  <Link to="/a-valider">
                    Et {todo.approvals_count - todo.approvals.length} autre(s) à valider
                  </Link>
                </li>
              )}
              {todo.callbacks.map((c) => (
                <li key={c.id}>
                  <span className="todo-kind kind-callback">À rappeler</span>
                  <div className="todo-main">
                    <strong>
                      {c.contact ? <Link to={`/clients/${c.contact.id}`}>{c.contact.name}</Link> : "Client"}
                      {c.contact?.phone && <span className="muted nowrap"> · {formatPhone(c.contact.phone)}</span>}
                    </strong>
                    <span className="muted clamp">{c.summary ?? c.title}</span>
                  </div>
                  <span className="todo-actions">
                    {c.contact?.phone && (
                      <a className="btn btn-small btn-ghost" href={`tel:${c.contact.phone}`}
                         aria-label={`Appeler ${c.contact.name}`}>
                        <Icon name="phone" size={16} />
                      </a>
                    )}
                    <button className="btn btn-small btn-ghost" onClick={() => markDone(c.id)}>Fait</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {orders && (
          <section className="card" aria-labelledby="orders-title">
            <h2 id="orders-title">Commandes à préparer</h2>
            {orders.upcoming.length === 0 && orders.undated.length === 0 && (
              <p className="muted">Aucune commande prévue cette semaine.</p>
            )}
            {orders.upcoming.map((day) => (
              <div key={day.date} className="order-day">
                <div className="order-day-head">
                  <h3>{day.label}</h3>
                  <span className="muted">{day.orders.length} commande(s)</span>
                </div>
                <p className="totals" aria-label="Total à préparer">
                  {day.totals.map((t) => <span key={t.product + (t.unit ?? "")} className="chip">{qty(t)}</span>)}
                </p>
                <OrderList orders={day.orders} onDone={markDone} />
              </div>
            ))}
            {orders.undated.length > 0 && (
              <div className="order-day">
                <div className="order-day-head">
                  <h3>Date à préciser</h3>
                  <span className="muted">à confirmer avec le client</span>
                </div>
                <OrderList orders={orders.undated} onDone={markDone} />
              </div>
            )}
          </section>
        )}
      </div>

      {today.invoices && today.invoices.unpaid_count > 0 && (
        <section className="card" aria-labelledby="inv-title">
          <div className="order-day-head">
            <h2 id="inv-title">Factures à encaisser</h2>
            <Link to="/factures">
              {today.invoices.unpaid_count} facture(s) · {formatEuro(today.invoices.unpaid_total)}
            </Link>
          </div>
          {today.invoices.overdue_count > 0 ? (
            <>
              <p className="status-echec">
                {today.invoices.overdue_count} en retard · {formatEuro(today.invoices.overdue_total)}
              </p>
              <ul className="order-list">
                {today.invoices.overdue.map((i) => (
                  <li key={i.id}>
                    <div className="todo-main">
                      <strong><Link to={`/factures/${i.id}`}>{i.number}</Link></strong>
                      <span className="muted">
                        {[i.contact?.name, `échue le ${new Date(i.due_date).toLocaleDateString("fr-FR")}`].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <strong className="nowrap">{formatEuro(i.remaining)}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="muted">Aucune facture en retard.</p>}
        </section>
      )}

      {today.quotes && today.quotes.awaiting_count > 0 && (
        <section className="card" aria-labelledby="quotes-title">
          <div className="order-day-head">
            <h2 id="quotes-title">Devis en attente de réponse</h2>
            <Link to="/devis?vue=envoyes">
              {today.quotes.awaiting_count} devis · {formatEuro(today.quotes.awaiting_total_ttc)} TTC
            </Link>
          </div>
          <ul className="order-list">
            {today.quotes.awaiting.map((q) => (
              <li key={q.id}>
                <div className="todo-main">
                  <strong><Link to={`/devis/${q.id}`}>{q.title || q.number}</Link></strong>
                  <span className="muted">
                    {[q.number, q.contact?.name, q.sent_at && `envoyé ${formatWhen(q.sent_at)}`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <strong className="nowrap">{formatEuro(q.total_ttc)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Activité récente</h2>
        {!recent && <Spinner />}
        {recent?.length === 0 && <p className="muted">Les appels et messages traités par l'assistant apparaîtront ici.</p>}
        <ul className="timeline">
          {recent?.map((i) => (
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
      </section>
    </>
  );
}

function OrderList({ orders, onDone }: { orders: UpcomingOrder[]; onDone: (id: string) => void }) {
  return (
    <ul className="order-list">
      {orders.map((o) => (
        <li key={o.id}>
          <div className="todo-main">
            <strong>
              {o.contact ? <Link to={`/clients/${o.contact.id}`}>{o.contact.name}</Link> : "Client"}
              {o.contact?.phone && <span className="muted nowrap"> · {formatPhone(o.contact.phone)}</span>}
            </strong>
            <span>{o.lines.map(qty).join(", ")}</span>
            <span className="muted">
              {[o.slot, o.location].filter(Boolean).join(" · ")}
              {o.notes && ` — « ${o.notes} »`}
            </span>
          </div>
          <button className="btn btn-small btn-ghost" onClick={() => onDone(o.id)}>
            <Icon name="check" size={16} />
            Retirée
          </button>
        </li>
      ))}
    </ul>
  );
}
