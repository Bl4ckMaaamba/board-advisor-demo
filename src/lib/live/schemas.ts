import { z } from "zod/v4";

// --- Session ---

export const MeetingConfigSchema = z.object({
  language: z.enum(["fr", "en"]).default("fr"),
  enableFactCheck: z.boolean().default(true),
  enableModeration: z.boolean().default(true),
  enableSuggestions: z.boolean().default(true),
  speakerDiarization: z.boolean().default(true),
});

export type MeetingConfig = z.infer<typeof MeetingConfigSchema>;

export const MeetingStatusSchema = z.enum([
  "idle",
  "recording",
  "paused",
  "completed",
]);

export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const MeetingTypeSchema = z.enum(["in_person", "visio"]).default("in_person");
export type MeetingTypeEnum = z.infer<typeof MeetingTypeSchema>;

export const RecallBotStatusSchema = z.enum(["joining", "in_call", "recording", "done", "error"]);
export type RecallBotStatusEnum = z.infer<typeof RecallBotStatusSchema>;

export const StartSessionRequestSchema = z.object({
  title: z.string().min(1).max(200),
  board_id: z.string().uuid().optional(),
  existing_meeting_id: z.string().uuid().optional(),
  meeting_type: MeetingTypeSchema.optional(),
  meeting_url: z.string().url().optional(),
  config: MeetingConfigSchema.optional(),
});

export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

// 1 MB cap on a single base64 chunk (~750 KB raw). At 16 kHz PCM16, 750 KB ≈ 23 s
// of audio, far above the ~250 ms chunks the client sends. Anything bigger is
// either misconfiguration or abuse — drop early.
const MAX_AUDIO_CHUNK_BASE64_BYTES = 1_000_000;

export const AudioChunkRequestSchema = z.object({
  meeting_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  chunk: z
    .string()
    .min(1)
    .max(MAX_AUDIO_CHUNK_BASE64_BYTES),
  chunk_index: z.number().int().min(0),
  timestamp: z.number().min(0), // seconds from meeting start
});

export type AudioChunkRequest = z.infer<typeof AudioChunkRequestSchema>;

export const MicJoinRequestSchema = z.object({
  meeting_id: z.string().uuid(),
});

export type MicJoinRequest = z.infer<typeof MicJoinRequestSchema>;

export const MicLeaveRequestSchema = z.object({
  meeting_id: z.string().uuid(),
});

export type MicLeaveRequest = z.infer<typeof MicLeaveRequestSchema>;

export const StopSessionRequestSchema = z.object({
  meeting_id: z.string().uuid(),
});

export type StopSessionRequest = z.infer<typeof StopSessionRequestSchema>;

// --- Transcription ---

export interface TranscriptionSegment {
  speaker: string | null;
  /**
   * Canonical speaker identity for multi-mic in-person mode. Set to the
   * authenticated user_id of the participant whose mic produced the segment.
   * Null for visio (Recall.ai gives names but no auth user) and legacy rows.
   */
  speaker_user_id?: string | null;
  content: string;
  timestamp_start: number;
  timestamp_end: number;
  confidence: number;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

// --- Claim Detection ---

export interface DetectedClaim {
  claim: string;
  confidence: number;
  source_text: string;
  speaker: string | null;
}

// --- Fact Check ---

export const VerdictSchema = z.enum([
  "true",
  "false",
  "partial",
  "unverifiable",
  "needs_context",
]);

export type Verdict = z.infer<typeof VerdictSchema>;

export interface FactCheckResult {
  claim: string;
  verdict: Verdict;
  confidence: number;
  explanation: string;
  sources: { title: string; url: string; provider: string }[];
  latency_ms: number;
}

// --- Moderation ---

export const ModerationTypeSchema = z.enum([
  "tone",
  "interruption",
  "speaking_time",
  "off_topic",
  "conflict",
]);

export const ModerationSeveritySchema = z.enum(["info", "warning", "alert"]);

export type ModerationType = z.infer<typeof ModerationTypeSchema>;
export type ModerationSeverity = z.infer<typeof ModerationSeveritySchema>;

export interface ModerationAlert {
  type: ModerationType;
  severity: ModerationSeverity;
  message: string;
  speaker: string | null;
  details: Record<string, unknown>;
}

// --- Suggestions ---

export const SuggestionTypeSchema = z.enum([
  "deep_dive",
  "question",
  "action_item",
  "reference",
]);

export const SuggestionPrioritySchema = z.enum(["low", "medium", "high"]);

export type SuggestionType = z.infer<typeof SuggestionTypeSchema>;
export type SuggestionPriority = z.infer<typeof SuggestionPrioritySchema>;

export interface Suggestion {
  type: SuggestionType;
  content: string;
  priority: SuggestionPriority;
  context: string | null;
}

// --- Session State ---

export interface SessionMetrics {
  total_chunks: number;
  total_segments: number;
  total_claims: number;
  total_factchecks: number;
  total_moderations: number;
  total_suggestions: number;
  avg_latency_ms: number;
  session_duration_s: number;
}

export interface SessionState {
  meeting_id: string;
  status: MeetingStatus;
  started_at: string | null;
  meeting_type: MeetingTypeEnum;
  recall_bot_id: string | null;
  metrics: SessionMetrics;
}
