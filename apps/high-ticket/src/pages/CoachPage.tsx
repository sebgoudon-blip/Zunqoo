import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { MODULES, allVisibleTasks, visibleTasks } from "../content/modules";
import { TOOL_LABELS } from "../tools/registry";
import { useAppState } from "../state";
import type { Module, Task, TaskStatus } from "../types";

const displayId = (id: string) => id.replace("ch", "");

function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

export function CoachPage() {
  const { profile, progress, setTaskStatus, notes, setNote } = useAppState();
  const flat = allVisibleTasks(profile!);
  const currentIndex = flat.findIndex(({ task }) => !progress[task.id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const doneCount = flat.filter(({ task }) => progress[task.id]).length;
  const percent = Math.round((doneCount / flat.length) * 100);

  const selected = flat.find(({ task }) => task.id === selectedId) ?? (currentIndex >= 0 ? flat[currentIndex] : null);
  const selectedPosition = selected ? flat.findIndex(({ task }) => task.id === selected.task.id) + 1 : 0;

  function answer(status: TaskStatus) {
    if (!selected) return;
    setTaskStatus(selected.task.id, status);
    setSelectedId(null);
    setShowQuestions(false);
    scrollToTop();
  }

  function select(id: string) {
    setSelectedId(id);
    setShowQuestions(false);
    setPlanOpen(false);
    scrollToTop();
  }

  return (
    <div className="coach">
      <aside className="coach-nav" aria-label="Plan du parcours">
        <div className="progress-head">
          <span>
            {doneCount} / {flat.length} tâches
          </span>
          <strong>{percent} %</strong>
        </div>
        <div className="bar" role="progressbar" aria-label="Progression du parcours" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <button
          type="button"
          className="plan-toggle"
          aria-expanded={planOpen}
          aria-controls="plan-list"
          onClick={() => setPlanOpen((v) => !v)}
        >
          <Icon name="list" />
          {planOpen ? "Masquer le plan" : "Voir le plan du parcours"}
          <span className={`chevron ${planOpen ? "up" : ""}`}>
            <Icon name="chevron" />
          </span>
        </button>
        <div id="plan-list" className={`plan-list ${planOpen ? "open" : ""}`}>
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
        </div>
      </aside>

      <section className="coach-main">
        {!selected ? (
          <div className="card done-card">
            <span className="done-badge">
              <Icon name="award" size={32} />
            </span>
            <h1>Parcours terminé</h1>
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
            position={selectedPosition}
            total={flat.length}
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
          const icon: IconName = status === "done" ? "check" : status === "skipped" ? "skip" : locked ? "lock" : "current";
          const stateLabel = status === "done" ? "réalisée" : status === "skipped" ? "sautée" : locked ? "verrouillée" : "en cours";
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={locked}
                aria-current={selectedId === t.id ? "step" : undefined}
                className={`nav-task ${status ?? ""} ${selectedId === t.id ? "active" : ""}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="nav-icon">
                  <Icon name={icon} size={15} />
                </span>
                <span>
                  {displayId(t.id)} · {t.title}
                  <span className="sr-only"> ({stateLabel})</span>
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
  position,
  total,
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
  position: number;
  total: number;
  status?: TaskStatus;
  isCurrent: boolean;
  note: string;
  onNote: (v: string) => void;
  showQuestions: boolean;
  onQuestions: () => void;
  onAnswer: (s: TaskStatus) => void;
  onReopen: () => void;
  onBackToCurrent: () => void;
}) {
  return (
    <article className="card task-card" key={task.id}>
      <p className="eyebrow">
        Module {module.number} · {module.title}
      </p>
      <h1>
        <span className="task-id">
          Tâche {displayId(task.id)} <span className="step-count">· étape {position} sur {total}</span>
        </span>
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
            <span className="meta-label">
              <Icon name="target" size={15} /> À la fin, tu as
            </span>
            <strong>{task.deliverable}</strong>
          </div>
        )}
        {task.cost && (
          <div>
            <span className="meta-label">
              <Icon name="coins" size={15} /> Coût
            </span>
            <strong>{task.cost}</strong>
          </div>
        )}
      </div>

      {task.tool && (
        <Link className="tool-link" to={`/outils/${task.tool}`}>
          <Icon name="wrench" />
          <span>
            Ouvrir l'outil : <b>{TOOL_LABELS[task.tool]}</b>
          </span>
          <Icon name="arrow" />
        </Link>
      )}

      {showQuestions && (
        <div className="questions" id="task-questions">
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
            <p className="muted">
              Pas encore de question fréquente sur cette tâche. Note ta question ci-dessous : elle restera attachée à
              la tâche.
            </p>
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
        <small>Enregistré automatiquement sur cet appareil.</small>
      </label>

      {status ? (
        <div className="answer answered">
          <p className={`answer-status ${status}`}>
            <Icon name={status === "done" ? "check" : "skip"} />
            Tâche {status === "done" ? "réalisée" : "sautée"}
          </p>
          <div className="answer-buttons">
            <button className="btn btn-ghost" type="button" onClick={onReopen}>
              Rouvrir cette tâche
            </button>
            <button className="btn btn-primary" type="button" onClick={onBackToCurrent}>
              Revenir à ma tâche en cours
              <Icon name="arrow" />
            </button>
          </div>
        </div>
      ) : (
        <div className="answer">
          <p className="prompt">
            {isCurrent ? "Avez-vous réalisé cette tâche ?" : "Cette tâche n'est pas encore validée."}
          </p>
          <div className="answer-buttons">
            <button className="btn btn-primary btn-main" type="button" onClick={() => onAnswer("done")}>
              <Icon name="check" />
              Oui, c'est fait
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              aria-expanded={showQuestions}
              aria-controls="task-questions"
              onClick={onQuestions}
            >
              <Icon name="help" />
              {showQuestions ? "Masquer" : "J'ai une question"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => onAnswer("skipped")}>
              <Icon name="skip" />
              Sauter
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
