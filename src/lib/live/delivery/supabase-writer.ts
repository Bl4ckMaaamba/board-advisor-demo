import { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  TranscriptionSegment,
  FactCheckResult,
  ModerationAlert,
  Suggestion,
} from "../schemas";
import { ExpertInsight } from "../expert/expert-insight";
import type { BlindSpotResult } from "../blind-spots";
import { liveLogger } from "../utils/logger";

let _svc: SupabaseClient | null = null;
function getSvc(): SupabaseClient {
  if (!_svc) _svc = createSupabaseServiceClient();
  return _svc;
}

export async function writeMeeting(data: {
  title: string;
  board_id?: string;
  user_id?: string;
  config?: Record<string, unknown>;
  agenda?: { order: number; title: string; duration_min?: number }[];
}): Promise<string> {
  const { data: meeting, error } = await getSvc()
    .from("meetings")
    .insert({
      title: data.title,
      board_id: data.board_id ?? null,
      user_id: data.user_id ?? null,
      status: "idle",
      config: data.config ?? {},
      agenda: data.agenda ?? [],
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create meeting: ${error.message}`);
  return meeting.id;
}

export async function updateMeetingStatus(
  meetingId: string,
  status: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === "recording") update.started_at = new Date().toISOString();
  if (status === "completed") update.ended_at = new Date().toISOString();
  Object.assign(update, extra ?? {});

  const { error } = await getSvc()
    .from("meetings")
    .update(update)
    .eq("id", meetingId);

  if (error) {
    liveLogger.error("Failed to update meeting status", {
      meeting_id: meetingId,
      status,
      error: error.message,
    });
  }
}

export async function writeTranscriptionSegments(
  meetingId: string,
  segments: TranscriptionSegment[],
  chunkIndex: number
): Promise<string[]> {
  if (segments.length === 0) return [];

  const rows = segments.map((seg) => ({
    meeting_id: meetingId,
    speaker: seg.speaker,
    speaker_user_id: seg.speaker_user_id ?? null,
    content: seg.content,
    timestamp_start: seg.timestamp_start,
    timestamp_end: seg.timestamp_end,
    confidence: seg.confidence,
    chunk_index: chunkIndex,
  }));

  const { data, error } = await getSvc()
    .from("meeting_transcriptions")
    .insert(rows)
    .select("id");

  if (error) {
    liveLogger.error("Failed to write transcription segments", {
      meeting_id: meetingId,
      count: segments.length,
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((r) => r.id);
}

export async function writeFactChecks(
  meetingId: string,
  results: FactCheckResult[],
  transcriptionIds: string[]
): Promise<void> {
  if (results.length === 0) return;

  const rows = results.map((r, i) => ({
    meeting_id: meetingId,
    transcription_id: transcriptionIds[i] ?? null,
    claim: r.claim,
    verdict: r.verdict,
    confidence: r.confidence,
    explanation: r.explanation,
    sources: r.sources,
    data_packets: [],
    latency_ms: r.latency_ms,
  }));

  const { error } = await getSvc().from("meeting_factchecks").insert(rows);

  if (error) {
    liveLogger.error("Failed to write fact-checks", {
      meeting_id: meetingId,
      count: results.length,
      error: error.message,
    });
  }
}

export async function writeModerationAlerts(
  meetingId: string,
  alerts: ModerationAlert[]
): Promise<void> {
  if (alerts.length === 0) return;

  const rows = alerts.map((a) => ({
    meeting_id: meetingId,
    type: a.type,
    severity: a.severity,
    message: a.message,
    speaker: a.speaker,
    details: a.details,
  }));

  const { error } = await getSvc().from("meeting_moderations").insert(rows);

  if (error) {
    liveLogger.error("Failed to write moderation alerts", {
      meeting_id: meetingId,
      count: alerts.length,
      error: error.message,
    });
  }
}

export async function writeSuggestions(
  meetingId: string,
  suggestions: Suggestion[]
): Promise<void> {
  if (suggestions.length === 0) return;

  const rows = suggestions.map((s) => ({
    meeting_id: meetingId,
    type: s.type,
    content: s.content,
    priority: s.priority,
    context: s.context,
  }));

  const { error } = await getSvc().from("meeting_suggestions").insert(rows);

  if (error) {
    liveLogger.error("Failed to write suggestions", {
      meeting_id: meetingId,
      count: suggestions.length,
      error: error.message,
    });
  }
}

export async function writeExpertInsight(
  meetingId: string,
  insight: ExpertInsight,
  isManual = false
): Promise<void> {
  const { error } = await getSvc().from("meeting_expert_insights").insert({
    meeting_id: meetingId,
    expert_id: insight.expert_id,
    expert_name: insight.expert_name,
    take: insight.take,
    analysis: insight.analysis,
    relevance_context: insight.relevance_context ?? null,
    tags: insight.tags,
    is_manual: isManual,
  });

  if (error) {
    liveLogger.error("Failed to write expert insight", {
      meeting_id: meetingId,
      expert_id: insight.expert_id,
      error: error.message,
    });
  }
}

export async function writeBlindSpot(
  meetingId: string,
  spot: BlindSpotResult
): Promise<void> {
  // Détermine source_type pour la colonne DB selon la kind de la source
  const sourceType =
    spot.source.kind === "document"
      ? "document"
      : spot.source.kind === "meeting_history" || spot.source.kind === "decision"
      ? spot.source.kind
      : spot.source.kind;

  const { error } = await getSvc().from("meeting_blind_spots").insert({
    meeting_id: meetingId,
    title: spot.title,
    description: spot.description,
    recommended_action: spot.recommended_action ?? null,
    type: spot.type,
    severity: spot.severity,
    domain: spot.domain ?? null,
    source_type: sourceType,
    source_reference: spot.source,
    is_manual: spot.is_manual ?? false,
    triggered_by_user_id: spot.triggered_by_user_id ?? null,
    trigger_query: spot.trigger_query ?? null,
    relevance_score: spot.relevance_score,
  });

  if (error) {
    liveLogger.error("Failed to write blind spot", {
      meeting_id: meetingId,
      type: spot.type,
      title: spot.title,
      error: error.message,
    });
  }
}
