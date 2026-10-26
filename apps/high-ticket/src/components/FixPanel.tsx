import { useEffect, useState } from "react";
import type { ApplyResult, ProposedChange } from "../lib/api";
import { TITLE_MAX, type FixKind } from "../lib/audit";
import { errorMessage } from "../lib/cloudConfig";
import { Icon } from "./Icon";

/** Ce dont le panneau a besoin pour proposer, appliquer et annuler des corrections. */
export interface FixController {
  /** Rapport d'exemple : aperçu seulement, rien n'est modifié. */
  demo: boolean;
  /** La boutique a autorisé les corrections (droits d'écriture). */
  canFix: boolean;
  shop: string;
  preview: (kind: FixKind, ids: string[]) => Promise<ProposedChange[]>;
  apply: (changes: ProposedChange[]) => Promise<ApplyResult[]>;
  undo: (changeId: string) => Promise<void>;
  authorize: () => Promise<void>;
}

const KIND_INTRO: Record<FixKind, string> = {
  product_title: "Titres proposés. Tu peux modifier chaque titre avant d'appliquer.",
  product_description: "Les phrases provisoires sont retirées ; le reste de la description ne change pas.",
  contact_page: "Page construite uniquement avec les coordonnées de Paramètres > Général. Vérifie-les avant de publier.",
};

/** Texte lisible d'un contenu HTML, pour l'aperçu. */
function toText(html: string) {
  return html
    .replace(/<br\s*\/?>|<\/(p|li|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, "\n")
    .trim();
}

type RowState = { selected: boolean; after: string; result?: ApplyResult; undone?: boolean; busy?: boolean; error?: string };

export function FixPanel({ kind, ids, controller }: { kind: FixKind; ids: string[]; controller: FixController }) {
  const [changes, setChanges] = useState<ProposedChange[] | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    controller
      .preview(kind, ids)
      .then((list) => {
        if (cancelled) return;
        setChanges(list);
        setRows(list.map((c) => ({ selected: true, after: c.after })));
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
    // L'aperçu est calculé une fois à l'ouverture du panneau.
  }, [kind, ids.join(",")]);

  const update = (i: number, patch: Partial<RowState>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pending = rows.filter((r) => r.selected && !r.result?.ok);
  const invalid = kind === "product_title" && pending.some((r) => !r.after.trim() || r.after.length > TITLE_MAX);

  async function apply() {
    if (!changes) return;
    const chosen = changes.map((c, i) => ({ c, i, r: rows[i] })).filter(({ r }) => r.selected && !r.result?.ok);
    const label = chosen.length > 1 ? `ces ${chosen.length} corrections` : "cette correction";
    if (!window.confirm(`Appliquer ${label} dans ${controller.shop} ? Tu pourras annuler ensuite.`)) return;
    setError(null);
    setApplying(true);
    try {
      const results = await controller.apply(chosen.map(({ c, r }) => ({ ...c, after: r.after.trim() })));
      chosen.forEach(({ i }, k) => update(i, { result: results[k] }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  async function undo(i: number) {
    const changeId = rows[i].result?.changeId;
    if (!changeId) return;
    update(i, { busy: true, error: undefined });
    try {
      await controller.undo(changeId);
      update(i, { busy: false, undone: true });
    } catch (err) {
      update(i, { busy: false, error: errorMessage(err) });
    }
  }

  if (error && !changes) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!changes) {
    return (
      <p className="muted" role="status">
        Préparation de l'aperçu…
      </p>
    );
  }
  if (!changes.length) {
    return <p className="muted">Aucune correction automatique possible ici : suis les étapes ci-dessus pour corriger à la main.</p>;
  }

  return (
    <div className="fix-panel">
      <p className="muted">{KIND_INTRO[kind]}</p>
      <ul className="fix-list">
        {changes.map((c, i) => {
          const row = rows[i];
          const done = row.result?.ok;
          const inputId = `fix-${kind}-${i}`;
          return (
            <li key={`${c.id ?? "new"}-${i}`} className={done ? "done" : undefined}>
              <label className="fix-select">
                <input type="checkbox" checked={row.selected} disabled={!!done} onChange={(e) => update(i, { selected: e.target.checked })} />
                <strong>{c.label}</strong>
              </label>
              <div className="fix-diff">
                <div className="fix-before">
                  <span className="fix-tag">Avant</span>
                  <p>{toText(c.before) || <em>(vide)</em>}</p>
                </div>
                <div className="fix-after">
                  <span className="fix-tag">Après</span>
                  {kind === "product_title" && !done ? (
                    <>
                      <label className="sr-only" htmlFor={inputId}>
                        Nouveau titre pour {c.label}
                      </label>
                      <input id={inputId} value={row.after} maxLength={TITLE_MAX} onChange={(e) => update(i, { after: e.target.value })} />
                      <small className="muted">
                        {row.after.length}/{TITLE_MAX} caractères
                      </small>
                    </>
                  ) : (
                    <p>{toText(row.after)}</p>
                  )}
                </div>
              </div>
              {row.result && !row.result.ok && (
                <p className="form-error" role="alert">
                  {row.result.error}
                </p>
              )}
              {done && (
                <p className="fix-status" role="status">
                  <Icon name="good" size={16} />
                  {row.undone ? "Annulée : l'ancienne valeur est rétablie." : "Appliquée dans Shopify."}
                  {!row.undone && (
                    <button className="link-btn" type="button" onClick={() => undo(i)} disabled={row.busy}>
                      {row.busy ? "Annulation…" : "Annuler"}
                    </button>
                  )}
                </p>
              )}
              {row.error && (
                <p className="form-error" role="alert">
                  {row.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {controller.demo ? (
        <p className="fix-note">
          <Icon name="help" size={16} />
          <span>Exemple : sur ta boutique, ce bouton appliquerait les corrections cochées, après confirmation.</span>
        </p>
      ) : !controller.canFix ? (
        <div className="fix-note">
          <p>
            Ta boutique est connectée en lecture seule. Pour corriger depuis l'app, autorise l'écriture des produits, des pages et
            des politiques. Chaque correction restera soumise à ta confirmation.
          </p>
          <button className="btn btn-ghost" type="button" onClick={() => controller.authorize()}>
            Autoriser les corrections dans Shopify
          </button>
        </div>
      ) : null}
      {!controller.demo && controller.canFix && pending.length > 0 && (
        <button className="btn btn-primary" type="button" onClick={apply} disabled={applying || invalid}>
          {applying ? "Application…" : `Appliquer ${pending.length} correction${pending.length > 1 ? "s" : ""}`}
        </button>
      )}
      {controller.demo && (
        <button className="btn btn-primary" type="button" disabled>
          Appliquer {pending.length} correction{pending.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
