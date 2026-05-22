/** Anti-repetition state for each expert session */
interface ExpertDedupState {
  previousTakes: string[];
  lastInterventionAt: number;
  interventionCountThisHour: number;
  hourWindowStart: number;
}

const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const MAX_INTERVENTIONS_PER_HOUR = 6;

const states = new Map<string, ExpertDedupState>();

function getState(expertId: string): ExpertDedupState {
  if (!states.has(expertId)) {
    states.set(expertId, {
      previousTakes: [],
      lastInterventionAt: 0,
      interventionCountThisHour: 0,
      hourWindowStart: Date.now(),
    });
  }
  return states.get(expertId)!;
}

/** Check if the expert is allowed to intervene right now */
export function canIntervene(expertId: string): boolean {
  const state = getState(expertId);
  const now = Date.now();

  // Reset hourly counter if window expired
  if (now - state.hourWindowStart > 60 * 60 * 1000) {
    state.interventionCountThisHour = 0;
    state.hourWindowStart = now;
  }

  if (now - state.lastInterventionAt < COOLDOWN_MS) return false;
  if (state.interventionCountThisHour >= MAX_INTERVENTIONS_PER_HOUR) return false;

  return true;
}

/** Record a new intervention */
export function recordIntervention(expertId: string, take: string): void {
  const state = getState(expertId);
  const now = Date.now();

  state.lastInterventionAt = now;
  state.interventionCountThisHour++;
  state.previousTakes.push(take);

  // Keep only last 10 takes to avoid huge context
  if (state.previousTakes.length > 10) {
    state.previousTakes = state.previousTakes.slice(-10);
  }
}

/** Get previous takes as formatted string for injection */
export function getPreviousTakesText(expertId: string): string {
  const state = getState(expertId);
  if (state.previousTakes.length === 0) return "Aucune intervention précédente.";
  return state.previousTakes.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

/** Reset all expert states (call on session start) */
export function resetExpertState(expertId?: string): void {
  if (expertId) {
    states.delete(expertId);
  } else {
    states.clear();
  }
}
