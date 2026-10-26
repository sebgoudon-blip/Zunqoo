import { useState } from "react";
import { RESOURCES, fillPlaceholders, resourceText, type Resource } from "../content/resources";
import { useStoredState } from "../hooks/useStoredState";
import { useAppState } from "../state";
import { AdsTracker } from "./AdsTracker";
import { Icon } from "./Icon";

export function TaskResources({ taskId }: { taskId: string }) {
  const resources = RESOURCES[taskId];
  if (!resources?.length) return null;
  return (
    <section className="resources" aria-labelledby={`res-${taskId}`}>
      <h2 id={`res-${taskId}`}>Ressources</h2>
      {resources.map((r) => (
        <ResourceBlock key={r.title} resource={r} taskId={taskId} />
      ))}
    </section>
  );
}

function ResourceBlock({ resource, taskId }: { resource: Resource; taskId: string }) {
  if (resource.kind === "tracker") {
    return (
      <details className="resource" open>
        <summary>
          <span className="resource-kind kind-tracker">Outil</span>
          <span>{resource.title}</span>
        </summary>
        <div className="resource-body">
          <AdsTracker />
        </div>
      </details>
    );
  }
  return <CopyableResource resource={resource} taskId={taskId} />;
}

function CopyableResource({ resource, taskId }: { resource: Exclude<Resource, { kind: "tracker" }>; taskId: string }) {
  const { profile } = useAppState();
  const [copied, setCopied] = useState(false);
  const [checks, setChecks] = useStoredState<Record<string, boolean>>("resource_checks", {});
  const text = fillPlaceholders(resourceText(resource), profile);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie le texte :", text);
    }
  }

  const label = resource.kind === "table" ? "Copier le tableau" : resource.kind === "checklist" ? "Copier la liste" : "Copier le modèle";

  return (
    <details className="resource">
      <summary>
        <span className={`resource-kind kind-${resource.kind}`}>
          {resource.kind === "template" ? "Modèle" : resource.kind === "table" ? "Exemples" : "Checklist"}
        </span>
        <span>{resource.title}</span>
      </summary>
      <div className="resource-body">
        {resource.kind === "template" && <pre>{text}</pre>}
        {resource.kind === "table" && (
          <>
            {resource.note && <p className="muted">{resource.note}</p>}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {resource.columns.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resource.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {resource.kind === "checklist" &&
          resource.items.map((item) => {
            const key = `${taskId}:${resource.id}:${item}`;
            return (
              <label key={item} className="check">
                <input type="checkbox" checked={!!checks[key]} onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))} />
                <span>{item}</span>
              </label>
            );
          })}
        <button className="btn btn-ghost" type="button" onClick={copy}>
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copié" : label}
        </button>
      </div>
    </details>
  );
}
