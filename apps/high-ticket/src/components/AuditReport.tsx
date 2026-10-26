import { useState } from "react";
import type { AuditReport as Report, AuditResult, Severity } from "../lib/audit";
import { downloadFile } from "../lib/download";
import { CATEGORY_LABELS, DISCLAIMER, SEVERITY_HINTS, SEVERITY_LABELS, failedBySeverity, reportToHtml, scoreLabel } from "../lib/report";
import { Icon, type IconName } from "./Icon";

const SEVERITY_ICON: Record<Severity, IconName> = { bloquant: "bad", important: "warn", conseil: "help" };
const SEVERITIES: Severity[] = ["bloquant", "important", "conseil"];

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function Finding({ r }: { r: AuditResult }) {
  return (
    <details className={`finding ${r.severity}`}>
      <summary>
        <span className={`sev-badge ${r.severity}`}>
          <Icon name={SEVERITY_ICON[r.severity]} size={14} />
          {SEVERITY_LABELS[r.severity]}
        </span>
        <span className="finding-title">{r.title}</span>
        <small className="muted">{r.detail}</small>
        <span className="finding-chevron" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
      </summary>
      <div className="finding-body">
        {r.items?.length ? (
          <ul className="finding-items">
            {r.items.map((item, i) => (
              <li key={i}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <strong>{item.label}</strong>
                )}
                {item.detail && <span className="muted"> — {item.detail}</span>}
              </li>
            ))}
            {r.count && r.count > r.items.length ? <li className="muted">… et {r.count - r.items.length} autre(s)</li> : null}
          </ul>
        ) : null}
        <h4>Pourquoi Google peut le sanctionner</h4>
        <p>{r.why}</p>
        <h4>Comment corriger</h4>
        <ol>
          {r.fix.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="finding-meta">
          {CATEGORY_LABELS[r.category]}
          {r.source && (
            <>
              {" · "}
              <a href={r.source} target="_blank" rel="noopener noreferrer">
                Règle officielle Google
              </a>
            </>
          )}
        </p>
      </div>
    </details>
  );
}

export function AuditReport({ report, sample = false }: { report: Report; sample?: boolean }) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const failed = failedBySeverity(report);
  const shown = filter === "all" ? failed : failed.filter((r) => r.severity === filter);
  const manual = report.results.filter((r) => r.status === "manual");
  const passed = report.results.filter((r) => r.status === "pass");
  const tone = report.counts.bloquant > 0 ? "bad" : report.score >= 90 ? "good" : "warn";

  const exportHtml = () => downloadFile(`audit-${slug(report.shop) || "boutique"}.html`, reportToHtml(report), "text/html");

  return (
    <div className="stack audit-report">
      <section className="card score-card" aria-labelledby="score-title">
        <div className="score-head">
          <div>
            <span className="meta-label" id="score-title">
              Score de conformité
            </span>
            <p className="score-value">
              <strong>{report.score}</strong>
              <span>/100</span>
            </p>
            <p className={`score-label ${tone}`}>
              <Icon name={tone} size={16} /> {scoreLabel(report)}
            </p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={exportHtml}>
            <Icon name="download" /> Exporter le rapport
          </button>
        </div>
        <div className={`bar score-bar ${tone}`} role="progressbar" aria-label="Score de conformité" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.score}>
          <div style={{ width: `${report.score}%` }} />
        </div>
        <ul className="sev-summary">
          {SEVERITIES.map((s) => (
            <li key={s} className={s}>
              <Icon name={SEVERITY_ICON[s]} size={16} />
              <strong>{report.counts[s]}</strong> {SEVERITY_LABELS[s].toLowerCase()}
              {report.counts[s] > 1 ? "s" : ""}
            </li>
          ))}
          <li className="ok">
            <Icon name="good" size={16} />
            <strong>{report.passed}</strong> réussi{report.passed > 1 ? "s" : ""}
          </li>
        </ul>
        <small className="muted">
          {sample ? "Rapport d'exemple sur une boutique fictive" : `Vérifié le ${new Date(report.checkedAt).toLocaleString("fr-FR")}`} ·{" "}
          {report.productsAudited < report.productsTotal
            ? `${report.productsAudited} produits analysés sur ${report.productsTotal} (les plus récemment modifiés)`
            : `${report.productsTotal} produit${report.productsTotal > 1 ? "s" : ""} analysé${report.productsTotal > 1 ? "s" : ""}`}
        </small>
      </section>

      <section className="card" aria-labelledby="todo-title">
        <h3 id="todo-title">Points à corriger ({failed.length})</h3>
        {failed.length > 0 && (
          <div className="segmented" role="group" aria-label="Filtrer par gravité">
            {(["all", ...SEVERITIES] as const).map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                {s === "all" ? `Tous (${failed.length})` : `${SEVERITY_LABELS[s]} (${report.counts[s]})`}
              </button>
            ))}
          </div>
        )}
        {filter !== "all" && <p className="muted">{SEVERITY_HINTS[filter]}</p>}
        {failed.length === 0 ? (
          <p>Aucun point à corriger parmi les contrôles automatiques. Vérifie quand même les points ci-dessous à la main.</p>
        ) : shown.length === 0 ? (
          <p className="muted">Aucun point de ce niveau.</p>
        ) : (
          <div className="finding-list">
            {shown.map((r) => (
              <Finding key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {manual.length > 0 && (
        <section className="card" aria-labelledby="manual-title">
          <h3 id="manual-title">À vérifier à la main ({manual.length})</h3>
          <ul className="audit-list">
            {manual.map((r) => (
              <li key={r.id} className="unknown">
                <Icon name="help" />
                <div>
                  <strong>{r.title}</strong>
                  <small>{r.detail}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card passed">
        <summary>
          <Icon name="good" /> Contrôles réussis ({passed.length})
        </summary>
        <ul className="audit-list">
          {passed.map((r) => (
            <li key={r.id} className="ok">
              <Icon name="good" />
              <div>
                <strong>{r.title}</strong>
                <small>{r.detail}</small>
              </div>
            </li>
          ))}
        </ul>
      </details>

      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
