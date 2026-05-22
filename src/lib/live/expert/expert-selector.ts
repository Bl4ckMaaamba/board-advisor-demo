import { EXPERTS, EXPERT_MAP, ExpertProfile, DEFAULT_EXPERT_ID } from "./expert-registry";

/**
 * Picks the default expert for a meeting at startup.
 *
 * Role-based panel logic: when the board has a sector defined, the dynamic
 * "Sectoriel" expert is the most useful default — it adapts its prompt to that
 * sector. Without a sector, fall back to the generalist Strategy expert. The
 * host can override at any time from the meeting detail page.
 */
export function selectExpertBySector(sector: string | null | undefined): ExpertProfile | null {
  if (sector && sector.trim().length > 0) {
    return EXPERT_MAP["expert_sectoriel"] ?? null;
  }
  return EXPERT_MAP[DEFAULT_EXPERT_ID] ?? null;
}

/** Returns all experts for the manual selection UI. */
export function getAllExperts(): ExpertProfile[] {
  return EXPERTS;
}
