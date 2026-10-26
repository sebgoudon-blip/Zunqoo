import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MODULES, allVisibleTasks } from "../content/modules";
import { downloadFile } from "../lib/download";
import { EMPTY_PROFILE, useAppState } from "../state";

const STATUS_LABEL = { done: "Réalisée", skipped: "Sautée" } as const;

export function NotebookPage() {
  const { profile, progress, notes, setNote } = useAppState();
  const [query, setQuery] = useState("");
  const flat = allVisibleTasks(profile ?? EMPTY_PROFILE);
  const currentIndex = flat.findIndex(({ task }) => !progress[task.id]);
  const q = query.trim().toLowerCase();
  // Les notes présentes à l'ouverture restent affichées même si on les vide pendant l'édition.
  const [initialIds] = useState(() => new Set(Object.keys(notes).filter((id) => notes[id]?.trim())));

  const entries = flat
    .map((entry, index) => ({ ...entry, index, note: notes[entry.task.id] ?? "" }))
    .filter((e) => e.note.trim() || initialIds.has(e.task.id))
    .filter((e) => !q || e.note.toLowerCase().includes(q) || e.task.title.toLowerCase().includes(q));

  const total = flat.filter(({ task }) => notes[task.id]?.trim()).length;

  function exportMarkdown() {
    const lines = [`# Carnet de notes – HighTicket Pilot`, ``, `Exporté le ${new Date().toLocaleDateString("fr-FR")}.`, ``];
    for (const m of MODULES) {
      const items = flat.filter(({ module, task }) => module.id === m.id && notes[task.id]?.trim());
      if (!items.length) continue;
      lines.push(`## Module ${m.number} – ${m.title}`, ``);
      for (const { task } of items) {
        lines.push(`### ${task.id.replace("ch", "")} – ${task.title}`, ``, notes[task.id].trim(), ``);
      }
    }
    downloadFile("carnet-highticket.md", lines.join("\n"), "text/markdown");
  }

  return (
    <div className="page narrow stack">
      <div>
        <h1>Mon carnet de notes</h1>
        <p>
          Toutes les notes prises pendant le parcours, au même endroit : chiffres, contacts fournisseurs, décisions,
          questions à creuser.
        </p>
      </div>

      {total === 0 ? (
        <div className="card empty">
          <Icon name="list" size={28} />
          <p>
            Ton carnet est vide. Dans chaque tâche, le champ « Mes notes et questions » alimente ce carnet
            automatiquement.
          </p>
          <Link className="btn btn-primary" to="/parcours">
            Aller au parcours <Icon name="arrow" />
          </Link>
        </div>
      ) : (
        <>
          <div className="notebook-tools">
            <label className="field grow">
              <span className="sr-only">Rechercher dans le carnet</span>
              <input type="search" value={query} placeholder="Rechercher dans mes notes…" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button className="btn btn-ghost" type="button" onClick={exportMarkdown}>
              <Icon name="download" />
              Exporter
            </button>
          </div>

          {entries.length === 0 && <p className="muted">Aucune note ne correspond à « {query} ».</p>}

          {MODULES.map((m) => {
            const items = entries.filter((e) => e.module.id === m.id);
            if (!items.length) return null;
            return (
              <section key={m.id} className="stack">
                <h2 className="notebook-module">
                  <span className="module-num small">{m.number}</span>
                  {m.title}
                </h2>
                {items.map(({ task, index, note }) => {
                  const status = progress[task.id];
                  const reachable = currentIndex < 0 || index <= currentIndex;
                  return (
                    <article key={task.id} className="card note-card">
                      <div className="note-head">
                        <div>
                          <span className="task-id">Tâche {task.id.replace("ch", "")}</span>
                          <h3>{task.title}</h3>
                        </div>
                        {status && <span className={`status-pill ${status}`}>{STATUS_LABEL[status]}</span>}
                      </div>
                      <label className="field">
                        <span className="sr-only">Note de la tâche {task.id}</span>
                        <textarea rows={Math.min(10, Math.max(3, note.split("\n").length + 1))} value={note} onChange={(e) => setNote(task.id, e.target.value)} />
                      </label>
                      {reachable && (
                        <Link className="link-btn" to={`/parcours?tache=${encodeURIComponent(task.id)}`}>
                          Ouvrir la tâche
                        </Link>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
