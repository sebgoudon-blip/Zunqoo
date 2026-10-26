import { useState } from "react";
import { Link } from "react-router-dom";
import { MODULES, allVisibleTasks, visibleTasks } from "../content/modules";
import { TOOL_LABELS } from "../tools/registry";
import { useAppState } from "../state";
import type { Module, Task } from "../types";

export function CoachPage() {
  const { profile, progress, setTaskStatus, notes, setNote } = useAppState();
  const flat = allVisibleTasks(profile!);
  const currentIndex = flat.findIndex(({ task }) => !progress[task.id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);

  const doneCount = flat.filter(({ task }) => progress[task.id]).length;
  const percent = Math.round((doneCount / flat.length) * 100);

  const selected = flat.find(({ task }) => task.id === selectedId) ?? (currentIndex >= 0 ? flat[currentIndex] : null);

  function answer(status: "done" | "skipped") {
    if (!selected) return;
    setTaskStatus(selected.task.id, status);
    setSelectedId(null);
    setShowQuestions(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function select(id: string) {
    setSelectedId(id);
    setShowQuestions(false);
  }

  return (
    <div className="coach">
      <aside className="coach-nav">
        <div className="progress-head">
          <span>Progression</span>
          <strong>{percent} %</strong>
        </div>
        <div className="bar">
          <div style={{ width: `${percent}%` }} />
        </div>
        {MODULES.map((m) => (
          <ModuleNav
            key={m.id}
            module={m}
            tasks={visibleTasks(m, profile!)}
            flatIds={flat.map(({ task }) => task.id)}
            currentIndex={currentIndex}
            selectedId={selected?.task.id}
            onSelect={select}
          />
        ))}
      </aside>

      <section className="coach-main">
        {!selected ? (
          <div className="card done-card">
            <h1>🎉 Parcours terminé</h1>
            <p>
              Tu as traversé les 7 modules. Continue d'appliquer le Module 7 chaque semaine : termes de recherche,
              enchères, avis et visibilité IA.
            </p>
            <Link className="btn btn-primary" to="/outils">
              Ouvrir les outils
            </Link>
          </div>
        ) : (
          <TaskCard
            module={selected.module}
            task={selected.task}
            status={progress[selected.task.id]}
            isCurrent={currentIndex >= 0 && flat[currentIndex].task.id === selected.task.id}
            note={notes[selected.task.id] ?? ""}
            onNote={(v) => setNote(selected.task.id, v)}
            showQuestions={showQuestions}
            onQuestions={() => setShowQuestions((v) => !v)}
            onAnswer={answer}
            onReopen={() => setTaskStatus(selected.task.id, null)}
            onBackToCurrent={() => setSelectedId(null)}
          />
        )}
      </section>
    </div>
  );
}

function ModuleNav({
  module,
  tasks,
  flatIds,
  currentIndex,
  selectedId,
  onSelect,
}: {
  module: Module;
  tasks: Task[];
  flatIds: string[];
  currentIndex: number;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { progress } = useAppState();
  const done = tasks.filter((t) => progress[t.id]).length;
  return (
    <div className="nav-module">
      <div className="nav-module-title">
        <span className="module-num small">{module.number}</span>
        <span>{module.title}</span>
        <em>
          {done}/{tasks.length}
        </em>
      </div>
      <ul>
        {tasks.map((t) => {
          const idx = flatIds.indexOf(t.id);
          const locked = currentIndex >= 0 && idx > currentIndex;
          const status = progress[t.id];
          const icon = status === "done" ? "✓" : status === "skipped" ? "↷" : locked ? "🔒" : "●";
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={locked}
                className={`nav-task ${status ?? ""} ${selectedId === t.id ? "active" : ""}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="nav-icon">{icon}</span>
                <span>
                  {t.id.replace("ch", "")} · {t.title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TaskCard({
  module,
  task,
  status,
  isCurrent,
  note,
  onNote,
  showQuestions,
  onQuestions,
  onAnswer,
  onReopen,
  onBackToCurrent,
}: {
  module: Module;
  task: Task;
  status?: string;
  isCurrent: boolean;
  note: string;
  onNote: (v: string) => void;
  showQuestions: boolean;
  onQuestions: () => void;
  onAnswer: (s: "done" | "skipped") => void;
  onReopen: () => void;
  onBackToCurrent: () => void;
}) {
  return (
    <article className="card task-card">
      <p className="eyebrow">
        Module {module.number} · {module.title}
      </p>
      <h1>
        <span className="task-id">Tâche {task.id.replace("ch", "")}</span>
        {task.title}
      </h1>

      <div className="why">
        <strong>Pourquoi c'est important</strong>
        <p>{task.why}</p>
      </div>

      <h2>Ce que tu fais maintenant</h2>
      <ol className="steps">
        {task.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <div className="task-meta">
        {task.deliverable && (
          <div>
            <span>À la fin, tu as</span>
            <strong>{task.deliverable}</strong>
          </div>
        )}
        {task.cost && (
          <div>
            <span>Coût</span>
            <strong>{task.cost}</strong>
          </div>
        )}
      </div>

      {task.tool && (
        <Link className="tool-link" to={`/outils/${task.tool}`}>
          🛠 Ouvrir l'outil : {TOOL_LABELS[task.tool]} →
        </Link>
      )}

      {showQuestions && (
        <div className="questions">
          {task.faq?.length ? (
            <>
              <h3>Questions fréquentes</h3>
              {task.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </>
          ) : (
            <p className="muted">Pas encore de question fréquente sur cette tâche.</p>
          )}
        </div>
      )}

      <label className="field notes">
        <span>Mes notes et questions sur cette tâche</span>
        <textarea
          rows={3}
          value={note}
          placeholder="Résultats, chiffres, questions à creuser…"
          onChange={(e) => onNote(e.target.value)}
        />
      </label>

      {status ? (
        <div className="answer answered">
          <p>
            Tâche {status === "done" ? "réalisée ✓" : "sautée ↷"}.
          </p>
          <div className="answer-buttons">
            <button className="btn btn-ghost" type="button" onClick={onReopen}>
              Rouvrir cette tâche
            </button>
            <button className="btn btn-primary" type="button" onClick={onBackToCurrent}>
              Revenir à ma tâche en cours
            </button>
          </div>
        </div>
      ) : (
        <div className="answer">
          <p className="prompt">
            {isCurrent ? "Avez-vous réalisé cette tâche ?" : "Cette tâche n'est pas encore validée."}
          </p>
          <div className="answer-buttons">
            <button className="btn btn-primary" type="button" onClick={() => onAnswer("done")}>
              Oui, c'est fait
            </button>
            <button className="btn btn-ghost" type="button" onClick={onQuestions}>
              {showQuestions ? "Masquer les questions" : "J'ai une question"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => onAnswer("skipped")}>
              Sauter
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
