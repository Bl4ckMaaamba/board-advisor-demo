import { QueryClassification, Entity } from "../schemas/query-plan";
import { BoardContext } from "../schemas/query-params";

export interface EnrichedQuery {
  originalQuery: string;
  classification: QueryClassification;
  entities: Entity[];
  sector: string | null;
  geo: string | null;
  companySize: string | null;
}

export function injectContext(
  originalQuery: string,
  classification: QueryClassification,
  boardContext?: BoardContext
): EnrichedQuery {
  const entities = [...classification.entities];

  if (boardContext) {
    // Add sector as entity if not already present
    const hasSector = entities.some(
      (e) => e.type === "sector" && e.name.toLowerCase() === boardContext.sector.toLowerCase()
    );
    if (!hasSector && boardContext.sector) {
      entities.push({ name: boardContext.sector, type: "sector" });
    }
  }

  return {
    originalQuery,
    classification,
    entities,
    sector: boardContext?.sector ?? null,
    geo: boardContext?.geo ?? null,
    companySize: boardContext?.company_size ?? null,
  };
}
