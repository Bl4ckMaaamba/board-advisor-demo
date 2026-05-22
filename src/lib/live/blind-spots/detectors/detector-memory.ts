/**
 * Détecteur Type B — Mémoire institutionnelle (board_decisions).
 *
 * Compare la discussion en cours aux décisions passées du board pour
 * détecter : contradictions, sujets ré-ouverts sans le savoir, décisions
 * ignorées. Utilise Haiku pour le coût (Stage 2 seulement si candidats).
 */

import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type {
  BlindSpotResult,
  BlindSpotSourceMemory,
  BlindSpotStage2Output,
} from "../blind-spots-types";
import { liveLogger } from "../../utils/logger";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_DECISIONS = 20;
const MIN_DECISIONS = 3;

let anthropicClient: Anthropic | null = null;
function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

interface DetectMemoryParams {
  meetingId: string;
  boardId: string | null;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  recentTranscript: string;
  previousEmissions: string;
  triggerQuery?: string;
  isManual?: boolean;
  triggeredByUserId?: string;
}

const SYSTEM_PROMPT = `Tu es un détecteur d'angles morts pour un conseil d'administration en réunion.

Ton rôle : identifier si la discussion actuelle CONTREDIT, IGNORE ou RÉ-OUVRE un sujet déjà tranché par une décision passée du board — sans que les participants ne le mentionnent.

PRINCIPES NON-NÉGOCIABLES :
1. Tu ne signales un angle mort QUE si une décision passée est directement en lien avec la discussion en cours.
2. Tu préfères le silence : si le lien est ténu ou indirect → emit: false.
3. Tu cites précisément la décision concernée (sujet, date, résultat du vote).
4. Tu ne signales PAS un sujet qui a été explicitement mentionné dans la transcription.

TYPES DE DÉTECTION :
- CONTRADICTION : la discussion va à l'encontre d'une décision validée
- OUBLI : un sujet tranché est ré-ouvert sans référence à la décision passée
- IGNORANCE : une décision active est pertinente mais personne ne la mentionne

CRITÈRES DE SÉVÉRITÉ :
- "critical" : contradiction directe avec une décision approuvée ou unanime
- "warning" : sujet ré-ouvert sans mention de la décision précédente
- "info" : décision pertinente au contexte mais non citée

DOMAINES :
finance, strategie, juridique, operations, rh, esg, tech (ou null)

FORMAT JSON STRICT :
Si rien à émettre :
{ "emit": false }

Si émission :
{
  "emit": true,
  "title": "Titre court ≤ 80 caractères",
  "description": "100-200 caractères, factuelle",
  "recommended_action": "Action concrète ou null",
  "severity": "critical" | "warning" | "info",
  "domain": "...",
  "decision_index": 0,
  "detection_type": "contradiction" | "oubli" | "ignorance"
}

decision_index est le numéro (0-based) de la décision dans la liste fournie.
Réponds UNIQUEMENT avec le JSON.`;

export async function detectMemory(params: DetectMemoryParams): Promise<BlindSpotResult | null> {
  if (!params.boardId) return null;

  const transcript = params.recentTranscript.trim();
  if (transcript.length < 50 && !params.triggerQuery) return null;

  // Fetch decisions
  const supabase = createSupabaseServiceClient();
  const { data: decisions, error } = await supabase
    .from("board_decisions")
    .select("id, subject, description, vote_result, status, created_at, meeting_id")
    .eq("board_id", params.boardId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(MAX_DECISIONS);

  if (error) {
    liveLogger.error("blind-spots detector-memory: fetch decisions failed", { error: error.message });
    return null;
  }

  if (!decisions || decisions.length < MIN_DECISIONS) return null;

  // Build decisions list
  const decisionsText = decisions
    .map((d, i) => {
      const date = new Date(d.created_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const vote = d.vote_result ? ` — Vote : ${d.vote_result}` : "";
      const desc = d.description ? `\n   ${d.description}` : "";
      return `[${i}] ${date}${vote}\n   Sujet : ${d.subject}${desc}`;
    })
    .join("\n\n");

  const boardCtx = [
    params.boardName ? `Board : ${params.boardName}` : null,
    params.boardSector ? `Secteur : ${params.boardSector}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const triggerSection = params.triggerQuery
    ? `\n\nDEMANDE EXPLICITE D'UN MEMBRE : "${params.triggerQuery}"`
    : "";

  const previousSection = params.previousEmissions
    ? `\n\nANGLES MORTS DÉJÀ SIGNALÉS :\n${params.previousEmissions}\nNe re-signale aucun de ceux-ci.`
    : "";

  const userPrompt = `=== CONTEXTE ===
${boardCtx || "(aucun)"}

=== DÉCISIONS PASSÉES DU BOARD (${decisions.length} plus récentes, actives) ===
${decisionsText}

=== TRANSCRIPTION RÉCENTE ===
${transcript}${triggerSection}${previousSection}

=== TÂCHE ===
Identifie si la discussion contredit, ignore ou ré-ouvre un sujet déjà tranché. Ou emit: false.`;

  // Call LLM
  let output: BlindSpotStage2Output & { decision_index?: number; detection_type?: string };
  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      liveLogger.warn("blind-spots detector-memory: no JSON in response");
      return null;
    }

    output = JSON.parse(jsonMatch[0]);
  } catch (err) {
    liveLogger.error("blind-spots detector-memory: LLM call failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!output.emit || !output.title || !output.description) return null;

  // Build source from matched decision
  const decisionIdx = output.decision_index ?? 0;
  const matched = decisions[decisionIdx] ?? decisions[0];

  const source: BlindSpotSourceMemory = {
    kind: "decision",
    meeting_id: matched.meeting_id ?? params.meetingId,
    decision_id: matched.id,
    meeting_date: new Date(matched.created_at).toISOString(),
    transcript_excerpt: `${matched.subject}${matched.description ? ` — ${matched.description.slice(0, 150)}` : ""}`,
  };

  return {
    title: output.title.slice(0, 120),
    description: output.description.slice(0, 300),
    recommended_action: output.recommended_action,
    type: "memory",
    severity: output.severity ?? "warning",
    domain: output.domain,
    source,
    relevance_score: 7, // fixed score for memory — always relatively important if emitted
    is_manual: params.isManual,
    triggered_by_user_id: params.triggeredByUserId,
    trigger_query: params.triggerQuery,
  };
}
