import { useRef, useState, type ChangeEvent } from "react";
import { downloadFile } from "../lib/download";
import { exportBackup, importBackup } from "../lib/store";
import { Icon, Verdict } from "./Icon";

export function BackupCard() {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  function download() {
    downloadFile(
      `highticket-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(exportBackup(), null, 2),
      "application/json"
    );
    setResult({ tone: "good", text: "Sauvegarde téléchargée. Garde ce fichier en lieu sûr." });
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Remplacer ta progression actuelle par celle de ce fichier ?")) return;
    try {
      const count = importBackup(JSON.parse(await file.text()));
      setResult({ tone: "good", text: `Sauvegarde restaurée (${count} éléments).` });
    } catch (err) {
      setResult({ tone: "bad", text: err instanceof Error && !(err instanceof SyntaxError) ? err.message : "Fichier illisible." });
    }
  }

  return (
    <section className="card stack" aria-labelledby="backup-title">
      <div>
        <h3 id="backup-title">Sauvegarde</h3>
        <p className="muted">
          Ta progression est enregistrée dans ce navigateur uniquement. Télécharge une sauvegarde pour la conserver ou
          la reprendre sur un autre appareil.
        </p>
      </div>
      <div className="answer-buttons">
        <button className="btn btn-primary" type="button" onClick={download}>
          <Icon name="download" />
          Télécharger une sauvegarde
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => input.current?.click()}>
          Restaurer une sauvegarde
        </button>
        <input ref={input} type="file" accept="application/json,.json" hidden onChange={restore} />
      </div>
      {result && <Verdict tone={result.tone}>{result.text}</Verdict>}
    </section>
  );
}
