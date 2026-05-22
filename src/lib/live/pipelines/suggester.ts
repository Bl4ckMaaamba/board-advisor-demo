import Anthropic from "@anthropic-ai/sdk";
import { Suggestion, TranscriptionSegment, DetectedClaim } from "../schemas";
import { liveLogger } from "../utils/logger";
import { parseLlmJson } from "../utils/parse-llm-json";
import { evaluateImportance, SUGGESTION_CRITERIA } from "../utils/importance-filter";
import { isDuplicate, recordPublication } from "../utils/semantic-dedup";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MIN_SEGMENTS = 6;
const MAX_SUGGESTIONS_PER_RUN = 2;

interface DetectorContext {
  recentSegments: TranscriptionSegment[];
  recentClaims: DetectedClaim[];
  meetingId: string;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  agendaText: string;
}

interface RawCandidate {
  reason: (typeof SUGGESTION_CRITERIA)[number];
  type: Suggestion["type"];
  content: string;
  priority: "high" | "medium";
  context: string;
}

async function proposeCandidates(ctx: DetectorContext): Promise<RawCandidate[]> {
  const text = ctx.recentSegments
    .slice(-15)
    .map((s) => `${s.speaker ? `[${s.speaker}] ` : ""}${s.content}`)
    .join("\n");
  const claimsContext = ctx.recentClaims.length > 0
    ? `\n\nAffirmations récentes:\n${ctx.recentClaims.map((c) => `- ${c.claim}`).join("\n")}`
    : "";
  const boardContext = [
    ctx.boardName ? `Entreprise : ${ctx.boardName}` : null,
    ctx.boardSector ? `Secteur : ${ctx.boardSector}` : null,
    ctx.boardStrategicContext ? `Contexte stratégique : ${ctx.boardStrategicContext}` : null,
  ].filter(Boolean).join("\n");
  const agendaSection = ctx.agendaText.trim().length > 0
    ? `\n\nOrdre du jour :\n${ctx.agendaText.trim()}`
    : "";

  const prompt = `Tu génères des suggestions pour un conseil d'administration UNIQUEMENT si tu identifies une raison concrète.

Raisons autorisées (renvoie EXACTEMENT un de ces strings dans "reason") :
- trou_agenda : un sujet de l'ordre du jour n'a pas été abordé et la réunion avance
- decision_sans_suite : la discussion conclut "on fera X" sans owner ni deadline
- info_docs_ignoree : un chiffre/fait des documents serait pertinent mais n'a pas été mentionné
- enjeu_structurel_manque : un sujet est traité tactiquement alors qu'un enjeu stratégique adjacent n'est pas posé

Règle d'or : silence par défaut. Public senior, pas de bruit. Si aucune raison ne s'applique précisément à ce qui vient d'être dit, retourne {"candidates": []}.

${boardContext ? `Contexte :\n${boardContext}` : ""}${agendaSection}

Discussion récente :
"""
${text}
"""${claimsContext}

Retourne UNIQUEMENT un JSON valide :
{
  "candidates": [
    {
      "reason": "trou_agenda" | "decision_sans_suite" | "info_docs_ignoree" | "enjeu_structurel_manque",
      "type": "deep_dive" | "question" | "action_item" | "reference",
      "content": "La suggestion concrète, en une phrase",
      "priority": "high" | "medium",
      "context": "Pourquoi cette raison s'applique ici"
    }
  ]
}

Maximum 3 candidats, mais zéro est la réponse normale si rien de précis ne se présente.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const rawParsed = parseLlmJson(content);
    if (!rawParsed || typeof rawParsed !== "object" || Array.isArray(rawParsed)) {
      liveLogger.error("suggester_invalid_response", {
        candidate_preview: content.slice(0, 120),
      });
      return [];
    }
    const parsed = rawParsed as { candidates?: Array<Record<string, unknown>> };
    const allowed = new Set<string>(SUGGESTION_CRITERIA);
    return (parsed.candidates ?? [])
      .filter((c) => typeof c.reason === "string" && allowed.has(c.reason as string))
      .map((c) => ({
        reason: c.reason as RawCandidate["reason"],
        type: (c.type ?? "question") as Suggestion["type"],
        content: String(c.content ?? "").trim(),
        priority: (c.priority === "high" ? "high" : "medium") as RawCandidate["priority"],
        context: String(c.context ?? "").trim(),
      }))
      .filter((c) => c.content.length > 0);
  } catch (error) {
    liveLogger.error("suggester_detector_error", { error: String(error) });
    return [];
  }
}

export async function generateSuggestions(
  recentSegments: TranscriptionSegment[],
  recentClaims: DetectedClaim[],
  meetingId: string,
  agendaText: string,
  boardName?: string,
  boardSector?: string,
  boardStrategicContext?: string
): Promise<Suggestion[]> {
  if (recentSegments.length < MIN_SEGMENTS) return [];
  const startTime = Date.now();

  const candidates = await proposeCandidates({
    recentSegments,
    recentClaims,
    meetingId,
    boardName,
    boardSector,
    boardStrategicContext,
    agendaText,
  });

  const published: Suggestion[] = [];
  for (const cand of candidates) {
    if (published.length >= MAX_SUGGESTIONS_PER_RUN) break;

    if (isDuplicate(meetingId, "suggestion", { tokens: cand.content })) {
      liveLogger.info("alert_dropped", {
        pipeline: "suggestion",
        meeting_id: meetingId,
        reason: "semantic_dedup",
        candidate_summary: cand.content.slice(0, 80),
      });
      continue;
    }

    const decision = await evaluateImportance({
      pipeline: "suggestion",
      meetingId,
      recentTranscript: recentSegments.slice(-15).map((s) => s.content).join(" "),
      boardSector,
      agendaText,
      candidate: `${cand.reason} — ${cand.content}`,
      detectedCriterionHint: cand.reason,
    });
    if (!decision.publish) continue;

    recordPublication(meetingId, "suggestion", { tokens: cand.content });
    published.push({
      type: cand.type,
      content: cand.content,
      priority: cand.priority,
      context: cand.context || null,
    });
  }

  if (published.length > 0) {
    liveLogger.info("suggestions_published", {
      meeting_id: meetingId,
      count: published.length,
      latency_ms: Date.now() - startTime,
    });
  }

  return published;
}

export function resetSuggestionState(meetingId?: string): void {
  // No module-level state anymore; dedup is owned by semantic-dedup, which is
  // reset via resetSessionBuffer in the orchestrator stop path. Parameter
  // kept for API symmetry with the other pipeline resetters.
  void meetingId;
}
