export interface ExpertProfile {
  id: string;
  name: string;
  title: string;
  /**
   * Sectors this expert is particularly relevant for (used by the legacy
   * sector-based auto-selector). Empty for generalist experts that apply to
   * any sector — they're picked manually by the host.
   */
  sectors: string[];
  sectorAliases: string[];
  cognitiveFramework: string;
  color: string;
}

/**
 * Role-based expert panel. Each expert is a domain specialist (Finance, Legal,
 * Strategy, Tech, Sector, HR, Marketing, ESG) — no celebrity persona — so the
 * panel reads as a serious advisory board rather than a gimmick.
 *
 * The "Expert Sectoriel" is dynamic: its prompt receives the board's sector at
 * runtime so it speaks as a specialist of whatever industry the board is in.
 */
export const EXPERTS: ExpertProfile[] = [
  {
    id: "expert_finance",
    name: "Expert Finance / M&A",
    title: "Spécialiste finance d'entreprise et opérations capitalistiques",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Allocation de capital, valuation, structure de deal, cash flow, ROIC",
    color: "#B45309",
  },
  {
    id: "expert_juridique",
    name: "Expert Juridique / Gouvernance",
    title: "Avocat d'affaires senior et spécialiste gouvernance",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Cadre légal, devoir fiduciaire, conflits d'intérêts, régulation, contentieux",
    color: "#1E3A8A",
  },
  {
    id: "expert_strategie",
    name: "Expert Stratégie",
    title: "Conseiller en stratégie d'entreprise",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Positionnement, avantage concurrentiel, options stratégiques, scénarios, séquencement",
    color: "#5B21B6",
  },
  {
    id: "expert_tech",
    name: "Expert Tech / Data",
    title: "Architecte technologique et data",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Architecture, levier data, IA / automatisation, dette technique, talent tech",
    color: "#0E7490",
  },
  {
    id: "expert_sectoriel",
    name: "Expert Sectoriel",
    title: "Spécialiste du secteur de l'entreprise (dynamique)",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Connaissance fine du secteur, acteurs clés, dynamiques concurrentielles, signaux faibles",
    color: "#0F766E",
  },
  {
    id: "expert_rh",
    name: "Expert RH / Organisation",
    title: "Directeur des ressources humaines et organisation",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Design organisationnel, talent critique, culture, succession, alignement des incentives",
    color: "#BE185D",
  },
  {
    id: "expert_marketing",
    name: "Expert Marketing / Commercial",
    title: "Directeur marketing et go-to-market",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Positionnement, GTM, brand equity, insights client, économie unitaire de l'acquisition",
    color: "#EA580C",
  },
  {
    id: "expert_esg",
    name: "Expert ESG / RSE",
    title: "Directeur RSE et durabilité",
    sectors: [],
    sectorAliases: [],
    cognitiveFramework: "Double matérialité, parties prenantes, CSRD / régulation, transition climatique, narratif extra-financier",
    color: "#15803D",
  },
];

export const EXPERT_MAP: Record<string, ExpertProfile> = Object.fromEntries(
  EXPERTS.map((e) => [e.id, e])
);

export const DEFAULT_EXPERT_ID = "expert_strategie";
