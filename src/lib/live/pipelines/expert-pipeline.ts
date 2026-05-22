import { TranscriptionSegment } from "../schemas";
import {
  checkRelevance,
  generateExpertInsight,
  canIntervene,
  recordIntervention,
  getPreviousTakesText,
} from "../expert";
import { ExpertProfile } from "../expert/expert-registry";
import { ExpertInsight } from "../expert/expert-insight";
import { generateQueryEmbedding } from "@/lib/rag";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { liveLogger } from "../utils/logger";

interface ExpertPipelineContext {
  meetingId: string;
  expert: ExpertProfile;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  boardId?: string;
  runningSummary: string;
  recentTranscript: string;
  allSegments: TranscriptionSegment[];
}

const RAG_MATCH_COUNT = 8;
const RAG_MATCH_THRESHOLD = 0.5;
const MAX_DOC_CONTEXT_CHARS = 3000;

/**
 * Fetch the most relevant document chunks for the current transcript topic.
 * Returns an empty string if boardId is missing or RAG fails.
 */
async function fetchDocumentContext(
  recentTranscript: string,
  boardId: string
): Promise<string> {
  if (recentTranscript.trim().length < 30) return "";
  try {
    const embedding = await generateQueryEmbedding(recentTranscript);
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_count: RAG_MATCH_COUNT,
      match_threshold: RAG_MATCH_THRESHOLD,
      filter_board_id: boardId,
      filter_document_ids: null,
      filter_user_id: null,
    });

    if (error || !data || data.length === 0) return "";

    const chunks = (data as Array<{
      document_name: string;
      section_title: string | null;
      content: string;
      similarity: number;
    }>)
      .filter((r) => r.similarity >= 0.55)
      .slice(0, 5);

    if (chunks.length === 0) return "";

    const text = chunks
      .map((c) => {
        const src = c.section_title ? `${c.document_name} — ${c.section_title}` : c.document_name;
        return `[${src}]\n${c.content}`;
      })
      .join("\n\n")
      .slice(0, MAX_DOC_CONTEXT_CHARS);

    return text;
  } catch (err) {
    liveLogger.warn("expert-pipeline: RAG fetch failed", { error: String(err) });
    return "";
  }
}

/**
 * Expert pipeline — 2-stage:
 * 1. Haiku relevance detection (fast, ~200ms)
 * 2. Sonnet insight generation (only when score ≥ 7, ~2-3s)
 *    → enriched with real document context from board pack (RAG)
 *
 * Returns null if: cooldown active, relevance too low, or model opts out.
 */
export async function runExpertPipeline(
  ctx: ExpertPipelineContext
): Promise<ExpertInsight | null> {
  const { expert } = ctx;

  // Guard: cooldown + hourly cap
  if (!canIntervene(expert.id)) return null;

  // Stage 1: relevance check
  const previousTakes = getPreviousTakesText(expert.id);
  const relevance = await checkRelevance(expert, ctx.recentTranscript, previousTakes);

  if (!relevance.should_intervene) return null;

  // Fetch relevant document chunks in parallel with stage 2 prep
  const documentContext = ctx.boardId
    ? await fetchDocumentContext(ctx.recentTranscript, ctx.boardId)
    : "";

  // Stage 2: generate insight
  const insight = await generateExpertInsight({
    expert,
    boardName: ctx.boardName,
    boardSector: ctx.boardSector,
    boardStrategicContext: ctx.boardStrategicContext,
    runningSummary: ctx.runningSummary,
    recentTranscript: ctx.recentTranscript,
    documentContext,
    previousInsights: previousTakes,
    relevanceContext: relevance.reason,
  });

  if (!insight) return null;

  recordIntervention(expert.id, insight.take);
  return insight;
}
