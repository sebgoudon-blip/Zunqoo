import type { AuditReport, AuditResult, Category, Severity } from "./audit";

export const SEVERITY_LABELS: Record<Severity, string> = {
  bloquant: "Bloquant",
  important: "Important",
  conseil: "Conseil",
};

export const SEVERITY_HINTS: Record<Severity, string> = {
  bloquant: "Risque de refus ou de suspension : à corriger avant tout.",
  important: "À corriger avant de lancer la publicité.",
  conseil: "Amélioration recommandée.",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  identite: "Identité et coordonnées",
  domaine: "Domaine et accès",
  politiques: "Politiques",
  produits: "Produits",
  tunnel: "Tunnel d'achat",
};

const ORDER: Severity[] = ["bloquant", "important", "conseil"];

export function failedBySeverity(report: AuditReport): AuditResult[] {
  return report.results
    .filter((r) => r.status === "fail")
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
}

export function scoreLabel(report: AuditReport): string {
  if (report.counts.bloquant > 0) return "Risque élevé";
  if (report.score >= 90) return "Bon niveau";
  if (report.score >= 70) return "À améliorer";
  return "Fragile";
}

export const DISCLAIMER =
  "Cet audit vérifie automatiquement des points fréquemment sanctionnés par Google Merchant Center. Il ne garantit ni l'approbation ni la réactivation d'un compte : Google seul décide. Les règles de Google évoluent : la documentation officielle citée pour chaque point fait foi.";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (url: string) => (/^https:\/\//.test(url) ? escape(url) : null);

function resultHtml(r: AuditResult): string {
  const items = r.items?.length
    ? `<ul class="items">${r.items
        .map((i) => {
          const label = i.url && safeUrl(i.url) ? `<a href="${safeUrl(i.url)}">${escape(i.label)}</a>` : escape(i.label);
          return `<li>${label}${i.detail ? ` — ${escape(i.detail)}` : ""}</li>`;
        })
        .join("")}${r.count && r.count > r.items.length ? `<li>… et ${r.count - r.items.length} autre(s)</li>` : ""}</ul>`
    : "";
  const source = r.source && safeUrl(r.source) ? `<p class="src">Référence : <a href="${safeUrl(r.source)}">${escape(r.source)}</a></p>` : "";
  return `<section class="finding ${r.severity}">
  <p class="tag">${SEVERITY_LABELS[r.severity]} · ${CATEGORY_LABELS[r.category]}</p>
  <h3>${escape(r.title)}</h3>
  <p><strong>Constat :</strong> ${escape(r.detail)}</p>
  ${items}
  <p><strong>Pourquoi c'est important :</strong> ${escape(r.why)}</p>
  <p><strong>Comment corriger :</strong></p>
  <ol>${r.fix.map((f) => `<li>${escape(f)}</li>`).join("")}</ol>
  ${source}
</section>`;
}

/** Rapport autonome (un seul fichier HTML), imprimable en PDF depuis le navigateur. */
export function reportToHtml(report: AuditReport): string {
  const failed = failedBySeverity(report);
  const manual = report.results.filter((r) => r.status === "manual");
  const passed = report.results.filter((r) => r.status === "pass");
  const date = new Date(report.checkedAt).toLocaleString("fr-FR");
  const partial =
    report.productsAudited < report.productsTotal
      ? `<p>Produits analysés : ${report.productsAudited} sur ${report.productsTotal} (les plus récemment modifiés).</p>`
      : "";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit de conformité – ${escape(report.shop)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1917; background: #fff; max-width: 780px; margin: 0 auto; padding: 32px 20px; line-height: 1.55; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.2rem; margin: 32px 0 12px; border-bottom: 1px solid #e7e5e4; padding-bottom: 6px; }
  h3 { font-size: 1.05rem; margin: 4px 0 8px; }
  .muted, .src { color: #57534e; font-size: 0.9rem; }
  .score { display: flex; gap: 20px; align-items: baseline; flex-wrap: wrap; margin: 20px 0; }
  .score strong { font-size: 2.6rem; }
  .finding { border: 1px solid #e7e5e4; border-left: 4px solid #a8a29e; border-radius: 10px; padding: 12px 16px; margin: 12px 0; break-inside: avoid; }
  .finding.bloquant { border-left-color: #b91c1c; }
  .finding.important { border-left-color: #a16207; }
  .tag { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #57534e; margin: 0; }
  .items { font-size: 0.92rem; }
  a { color: #1c1917; }
  .disclaimer { margin-top: 32px; padding: 12px 16px; background: #f5f5f4; border-radius: 10px; font-size: 0.9rem; }
  @media print { body { padding: 0; } a { text-decoration: none; } }
</style>
</head>
<body>
<h1>Audit de conformité Google Merchant Center</h1>
<p class="muted">${escape(report.shop)} · ${escape(report.domain)} · ${escape(date)}</p>
<div class="score"><strong>${report.score}/100</strong><span>${scoreLabel(report)} — ${report.counts.bloquant} bloquant(s), ${report.counts.important} important(s), ${report.counts.conseil} conseil(s)</span></div>
${partial}
<h2>Points à corriger (${failed.length})</h2>
${failed.length ? failed.map(resultHtml).join("\n") : "<p>Aucun point à corriger parmi les contrôles automatiques.</p>"}
${manual.length ? `<h2>À vérifier à la main (${manual.length})</h2>\n${manual.map((r) => `<p><strong>${escape(r.title)}</strong> : ${escape(r.detail)}</p>`).join("\n")}` : ""}
<h2>Contrôles réussis (${passed.length})</h2>
<ul>${passed.map((r) => `<li>${escape(r.title)}</li>`).join("")}</ul>
<p class="disclaimer">${escape(DISCLAIMER)}</p>
</body>
</html>`;
}
