import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AdsPlanner } from "../tools/AdsPlanner";
import { GmcChecklist } from "../tools/GmcChecklist";
import { LegalGenerator } from "../tools/LegalGenerator";
import { ProductScore } from "../tools/ProductScore";
import { ProfitCalculator } from "../tools/ProfitCalculator";
import { TOOL_DESCRIPTIONS, TOOL_LABELS, TOOL_ORDER } from "../tools/registry";
import type { ToolId } from "../types";

const COMPONENTS: Record<ToolId, () => JSX.Element> = {
  profit: ProfitCalculator,
  score: ProductScore,
  ads: AdsPlanner,
  legal: LegalGenerator,
  gmc: GmcChecklist,
};

export function ToolsPage() {
  const { toolId } = useParams();
  const tool = TOOL_ORDER.find((t) => t === toolId);

  if (!tool) {
    return (
      <div className="page">
        <h1>Outils</h1>
        <p>Tous les outils sont aussi proposés au bon moment dans ton parcours.</p>
        <div className="tool-cards">
          {TOOL_ORDER.map((t) => (
            <Link key={t} to={`/outils/${t}`} className="card tool-card">
              <strong>{TOOL_LABELS[t]}</strong>
              <span>{TOOL_DESCRIPTIONS[t]}</span>
              <span className="tool-card-cta">
                Ouvrir <Icon name="arrow" size={16} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const Tool = COMPONENTS[tool];
  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/outils">Outils</Link> / <Link to="/parcours">Retour au parcours</Link>
      </div>
      <h1>{TOOL_LABELS[tool]}</h1>
      <p>{TOOL_DESCRIPTIONS[tool]}</p>
      <Tool />
    </div>
  );
}
