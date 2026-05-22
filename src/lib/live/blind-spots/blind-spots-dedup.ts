/**
 * Dedup et quota pour le pipeline Blind Spots.
 *
 * Pattern aligné sur expert-dedup.ts mais avec quotas plus stricts
 * (l'objectif est de ne PAS saturer l'utilisateur avec des angles morts).
 *
 * État en mémoire (réinitialisé à chaque restart serveur, comme expert-dedup).
 *
 * Spec: specs/features/blind-spots.md § 9
 */

import type { BlindSpotDomain, BlindSpotResult } from "./blind-spots-types";

interface BlindSpotEmission {
  title: string;
  description: string;
  domain: BlindSpotDomain | undefined;
  emittedAt: number;
  severity: "critical" | "warning" | "info";
}

interface SessionState {
  emissions: BlindSpotEmission[];
  hourWindowStart: number;
}

// Quotas (cf. CDC § 9.2)
const MAX_EMISSIONS_PER_HOUR = 5;
const MIN_INTERVAL_BETWEEN_EMISSIONS_MS = 5 * 60 * 1000; // 5 min, sauf critical
const MAX_PER_DOMAIN_PER_HOUR = 2;
const HOUR_MS = 60 * 60 * 1000;

// Dedup similarité simple (Jaccard sur tokens)
const SIMILARITY_THRESHOLD = 0.6;

const states = new Map<string, SessionState>();

function getState(meetingId: string): SessionState {
  const existing = states.get(meetingId);
  if (existing) {
    // Reset hourly window if needed
    if (Date.now() - existing.hourWindowStart > HOUR_MS) {
      existing.hourWindowStart = Date.now();
      existing.emissions = existing.emissions.filter(
        (e) => Date.now() - e.emittedAt < HOUR_MS
      );
    }
    return existing;
  }

  const fresh: SessionState = {
    emissions: [],
    hourWindowStart: Date.now(),
  };
  states.set(meetingId, fresh);
  return fresh;
}

/** Vérifie si on a le droit d'émettre un nouvel angle mort */
export function canEmit(meetingId: string, severity: "critical" | "warning" | "info"): boolean {
  const state = getState(meetingId);
  const now = Date.now();

  // Quota global par heure
  const recentEmissions = state.emissions.filter((e) => now - e.emittedAt < HOUR_MS);
  if (recentEmissions.length >= MAX_EMISSIONS_PER_HOUR) return false;

  // Intervalle minimum entre deux émissions (sauf critical)
  if (severity !== "critical" && state.emissions.length > 0) {
    const lastEmission = state.emissions[state.emissions.length - 1];
    if (now - lastEmission.emittedAt < MIN_INTERVAL_BETWEEN_EMISSIONS_MS) return false;
  }

  return true;
}

/** Vérifie si le quota par domaine est atteint */
export function canEmitForDomain(
  meetingId: string,
  domain: BlindSpotDomain | undefined
): boolean {
  if (!domain) return true;
  const state = getState(meetingId);
  const now = Date.now();
  const recentInDomain = state.emissions.filter(
    (e) => e.domain === domain && now - e.emittedAt < HOUR_MS
  );
  return recentInDomain.length < MAX_PER_DOMAIN_PER_HOUR;
}

/**
 * Dedup par similarité textuelle simple (Jaccard sur tokens).
 * Pour le dedup sémantique avancé (cosine via embeddings), à ajouter en V2.
 */
export function isDuplicate(meetingId: string, candidate: BlindSpotResult): boolean {
  const state = getState(meetingId);
  const candidateText = normalizeText(`${candidate.title} ${candidate.description}`);
  const candidateTokens = new Set(candidateText.split(/\s+/).filter((t) => t.length > 3));

  if (candidateTokens.size === 0) return false;

  for (const emission of state.emissions) {
    const emissionText = normalizeText(`${emission.title} ${emission.description}`);
    const emissionTokens = new Set(emissionText.split(/\s+/).filter((t) => t.length > 3));

    if (emissionTokens.size === 0) continue;

    const candidateArr = Array.from(candidateTokens);
    const emissionArr = Array.from(emissionTokens);
    const intersection = candidateArr.filter((t) => emissionTokens.has(t));
    const union = new Set(candidateArr.concat(emissionArr));

    const jaccard = intersection.length / union.size;
    if (jaccard >= SIMILARITY_THRESHOLD) return true;
  }

  return false;
}

/** Enregistre une émission (à appeler après écriture en DB) */
export function recordEmission(meetingId: string, result: BlindSpotResult): void {
  const state = getState(meetingId);
  state.emissions.push({
    title: result.title,
    description: result.description,
    domain: result.domain,
    emittedAt: Date.now(),
    severity: result.severity,
  });

  // Garder les 100 dernières émissions max pour éviter de saturer la mémoire
  if (state.emissions.length > 100) {
    state.emissions = state.emissions.slice(-100);
  }
}

/** Récupère les émissions récentes (pour passage au Stage 2 comme contexte) */
export function getRecentEmissionsText(meetingId: string, limit = 10): string {
  const state = getState(meetingId);
  return state.emissions
    .slice(-limit)
    .map((e) => `- ${e.title}: ${e.description}`)
    .join("\n");
}

/** Reset complet (utilisé en début de session ou en test) */
export function resetSession(meetingId: string): void {
  states.delete(meetingId);
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
