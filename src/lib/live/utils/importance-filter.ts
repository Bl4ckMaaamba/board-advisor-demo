import Anthropic from "@anthropic-ai/sdk";
import { liveLogger } from "./logger";
import { parseLlmJson } from "./parse-llm-json";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const PUBLISH_THRESHOLD = Number(process.env.LIVE_PUBLISH_THRESHOLD ?? 7);

export const FACTCHECK_CRITERIA = ["chiffre_materiel", "allegation_a_effet", "conflit_docs"] as const;
export const MODERATION_CRITERIA = ["interruption_repetee", "monopolisation_persistante", "silence_anormal"] as const;
export const SUGGESTION_CRITERIA = [
  "trou_agenda",
  "decision_sans_suite",
  "info_docs_ignoree",
  "enjeu_structurel_manque",
] as const;

export type FactcheckCriterion = (typeof FACTCHECK_CRITERIA)[number];
export type ModerationCriterion = (typeof MODERATION_CRITERIA)[number];
export type SuggestionCriterion = (typeof SUGGESTION_CRITERIA)[number];

import type { PipelineKind } from "./semantic-dedup";
export type Pipeline = PipelineKind;

export interface FilterContext {
  pipeline: Pipeline;
  meetingId: string;
  recentTranscript: string;
  boardSector?: string;
  agendaText?: string;
  /** Free-form description of the candidate. */
  candidate: string;
  /** Pre-detected motif for moderation, used to constrain the LLM's criterion choice. */
  detectedCriterionHint?: string;
}

export interface FilterDecision {
  publish: boolean;
  score: number;
  criterion: string | null;
  reason: "score_below_threshold" | "out_of_criteria" | "llm_error" | "ok";
}

const CRITERIA_BY_PIPELINE: Record<Pipeline, readonly string[]> = {
  factcheck: FACTCHECK_CRITERIA,
  moderation: MODERATION_CRITERIA,
  suggestion: SUGGESTION_CRITERIA,
};

function buildPrompt(ctx: FilterContext): string {
  const allowedCriteria = CRITERIA_BY_PIPELINE[ctx.pipeline].join(", ");
  const agendaSection = ctx.agendaText && ctx.agendaText.trim().length > 0
    ? `\n\nOrdre du jour de la réunion :\n${ctx.agendaText.trim()}`
    : "";
  const sectorSection = ctx.boardSector ? `\nSecteur du board : ${ctx.boardSector}` : "";
  const hintSection = ctx.detectedCriterionHint
    ? `\nMotif pré-détecté côté code : ${ctx.detectedCriterionHint}`
    : "";

  const intro = ({
    factcheck: "Tu décides si une affirmation vaut la peine d'être fact-checkée pour un conseil d'administration.",
    moderation: "Tu décides si un motif de modération mérite une alerte au board.",
    suggestion: "Tu décides si une suggestion mérite d'être affichée au board.",
  } as const)[ctx.pipeline];

  return `${intro}

Tu réponds UNIQUEMENT en JSON :
{ "score": 1-10, "criterion": "<un des critères autorisés ou null>" }

Critères autorisés (renvoie EXACTEMENT un de ces strings, ou null si aucun ne s'applique) :
${allowedCriteria}

Règle d'or : silence par défaut. Le public est composé d'administrateurs senior, ils n'acceptent pas le bruit. Score ≥ 7 seulement si la raison est concrète, formulable, et propre à la situation.${sectorSection}${agendaSection}${hintSection}

Extrait récent du transcript :
"""
${ctx.recentTranscript.slice(-1500)}
"""

Candidat à évaluer :
"""
${ctx.candidate}
"""

Réponds avec le JSON, rien d'autre.`;
}

export async function evaluateImportance(ctx: FilterContext): Promise<FilterDecision> {
  const allowed = new Set<string>(CRITERIA_BY_PIPELINE[ctx.pipeline]);
  const startTime = Date.now();

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const rawParsed = parseLlmJson(content);
    if (!rawParsed || typeof rawParsed !== "object" || Array.isArray(rawParsed)) {
      throw new Error(`unexpected LLM response shape: ${content.slice(0, 120)}`);
    }
    const parsed = rawParsed as { score?: number; criterion?: string | null };

    const score = typeof parsed.score === "number" ? parsed.score : 0;
    const criterion = typeof parsed.criterion === "string" ? parsed.criterion : null;

    let decision: FilterDecision;
    if (score < PUBLISH_THRESHOLD) {
      decision = { publish: false, score, criterion, reason: "score_below_threshold" };
    } else if (!criterion || !allowed.has(criterion)) {
      decision = { publish: false, score, criterion, reason: "out_of_criteria" };
    } else {
      decision = { publish: true, score, criterion, reason: "ok" };
    }

    liveLogger.info(decision.publish ? "alert_published" : "alert_dropped", {
      pipeline: ctx.pipeline,
      meeting_id: ctx.meetingId,
      reason: decision.reason,
      score: decision.score,
      criterion: decision.criterion,
      candidate_summary: ctx.candidate.slice(0, 80),
      latency_ms: Date.now() - startTime,
    });

    return decision;
  } catch (error) {
    const errInfo = error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          status: (error as { status?: unknown }).status,
        }
      : { message: String(error) };
    liveLogger.error("importance_filter_error", {
      pipeline: ctx.pipeline,
      meeting_id: ctx.meetingId,
      error: errInfo,
    });
    // Fail-closed: if the LLM is unreachable, we drop rather than spam.
    return { publish: false, score: 0, criterion: null, reason: "llm_error" };
  }
}
