import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { useStoredState } from "../hooks/useStoredState";
import { askCoach, profileSummary, type ChatMessage } from "../lib/api";
import { errorMessage } from "../lib/cloudConfig";
import { useAppState } from "../state";
import type { Task } from "../types";
import { Icon } from "./Icon";

const MAX_STORED = 20;

export function AssistantChat({ task }: { task: Task }) {
  const { cloudEnabled, user } = useAuth();
  const { profile } = useAppState();
  const [chats, setChats] = useStoredState<Record<string, ChatMessage[]>>("chats", {});
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = chats[task.id] ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, loading]);

  if (!cloudEnabled) {
    return <p className="muted">Note ta question dans le champ ci-dessous : elle restera attachée à la tâche.</p>;
  }

  if (!user) {
    return (
      <div className="assistant locked">
        <Icon name="help" />
        <p>
          <Link to="/compte">Connecte-toi</Link> pour poser ta question à l'assistant IA : il répond en tenant compte de
          cette tâche et de ton profil.
        </p>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setLoading(true);
    const withQuestion = [...messages, { role: "user" as const, content: q }];
    setChats((prev) => ({ ...prev, [task.id]: withQuestion.slice(-MAX_STORED) }));
    setQuestion("");
    try {
      const res = await askCoach({
        task: { id: task.id, title: task.title, why: task.why, steps: task.steps },
        profile: profileSummary(profile),
        history: messages,
        question: q,
      });
      setRemaining(res.remaining);
      setChats((prev) => ({
        ...prev,
        [task.id]: [...(prev[task.id] ?? []), { role: "assistant" as const, content: res.answer }].slice(-MAX_STORED),
      }));
    } catch (err) {
      setError(errorMessage(err));
      // On retire la question restée sans réponse et on la remet dans le champ.
      setChats((prev) => ({ ...prev, [task.id]: messages }));
      setQuestion(q);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="assistant" aria-label="Assistant IA">
      <h3>
        <Icon name="help" /> Demande à l'assistant
      </h3>
      {messages.length > 0 && (
        <div className="chat" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="bubble assistant typing">L'assistant réfléchit…</div>}
          <div ref={endRef} />
        </div>
      )}
      {!messages.length && loading && <div className="bubble assistant typing">L'assistant réfléchit…</div>}
      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`q-${task.id}`}>
          Ta question
        </label>
        <textarea
          id={`q-${task.id}`}
          rows={2}
          value={question}
          maxLength={2000}
          placeholder="Ex. : Quelle néobanque choisir pour une SASU qui débute ?"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !question.trim()}>
          {loading ? "Envoi…" : "Envoyer"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <small className="muted">
        Réponses générées par IA : vérifie les chiffres et règles sur les sites officiels.
        {remaining !== null && ` ${remaining} question(s) restante(s) aujourd'hui.`}
      </small>
    </section>
  );
}
