import {
  MeetingConfig,
  MeetingStatus,
  MeetingTypeEnum,
  TranscriptionSegment,
  DetectedClaim,
  SessionMetrics,
  SessionState,
} from "./schemas";
import { DeepgramStreamingClient } from "./transcription/deepgram-client";
import { TranscriptionBuffer } from "./transcription/transcription-buffer";
import { SpeakerTurnBuffer, SpeakerTurn } from "./transcription/speaker-turn-buffer";
import { detectClaims } from "./pipelines/claim-detector";
import { factCheckClaims } from "./pipelines/fact-checker";
import { moderate, resetModeratorState } from "./pipelines/moderator";
import { generateSuggestions, resetSuggestionState } from "./pipelines/suggester";
import { SpeakerTracker } from "./utils/speaker-tracker";
import { LatencyMonitor } from "./utils/latency-monitor";
import { liveLogger } from "./utils/logger";
import {
  writeMeeting,
  updateMeetingStatus,
  writeTranscriptionSegments,
  writeFactChecks,
  writeModerationAlerts,
  writeSuggestions,
} from "./delivery/supabase-writer";
import { ExpertProfile } from "./expert/expert-registry";
import { resetExpertState } from "./expert";
import { resetSessionBuffer } from "./utils/semantic-dedup";
import { fetchAgendaText } from "./utils/fetch-agenda-text";
import { generateRunningSummary } from "./summary/generate-running-summary";

const PIPELINE_TIMEOUT_MS = 8000;
const SUMMARY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FACTCHECK_TIMEOUT_MS = 40000; // fact-check appelle le Data Broker (jusqu'à 30s) + Haiku synthèse
const MAX_ACTIVE_MICS = 12;
const RATE_LIMIT_CHUNKS_PER_SEC = 100;

/** One Deepgram WebSocket per participant in multi-mic in-person mode. */
interface MicStream {
  participantId: string; // = auth user_id
  displayName: string;
  client: DeepgramStreamingClient;
  joinedAt: number;
  /** Sliding 1 s window of recent chunk arrivals; for rate limiting. */
  recentChunkArrivals: number[];
  totalChunks: number;
  droppedChunks: number;
}

interface LiveSession {
  meetingId: string;
  status: MeetingStatus;
  config: MeetingConfig;
  meetingType: MeetingTypeEnum;
  recallBotId: string | null;
  startedAt: Date | null;
  segmentIndex: number;
  /** Multi-mic in-person: empty for visio (transcripts come via webhook). */
  micStreams: Map<string, MicStream>;
  /** Keyterms shared across all Deepgram streams (board name + member names). */
  keyterms: string[];
  transcriptionBuffer: TranscriptionBuffer;
  turnBuffer: SpeakerTurnBuffer | null;
  speakerTracker: SpeakerTracker;
  latencyMonitor: LatencyMonitor;
  recentClaims: DetectedClaim[];
  metrics: SessionMetrics;
  pendingPipelines: Set<Promise<void>>;
  // Meeting agenda — raw text from uploaded agenda document
  meetingAgenda: string;
  // Expert panel
  expertProfile: ExpertProfile | null;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  boardId?: string;
  runningSummary: string;
  // Blind spots
  lastBlindSpotsRunAt: number;
  lastBlindSpotsExternalAt: number;
  // Running summary
  lastSummaryAt: number;
}

// In-memory session store — use globalThis to survive Next.js hot reloads
const globalSessions = globalThis as typeof globalThis & {
  __liveSessions?: Map<string, LiveSession>;
};
if (!globalSessions.__liveSessions) {
  globalSessions.__liveSessions = new Map();
}
const sessions = globalSessions.__liveSessions;

export async function startSession(
  title: string,
  boardId?: string,
  config?: Partial<MeetingConfig>,
  userId?: string,
  expertProfile?: ExpertProfile | null,
  boardName?: string,
  boardSector?: string,
  boardStrategicContext?: string,
  memberNames?: string[],
  existingMeetingId?: string
): Promise<string> {
  const fullConfig: MeetingConfig = {
    language: config?.language ?? "fr",
    enableFactCheck: config?.enableFactCheck ?? true,
    enableModeration: config?.enableModeration ?? true,
    enableSuggestions: config?.enableSuggestions ?? true,
    speakerDiarization: config?.speakerDiarization ?? false,
  };

  // Reuse existing meeting if provided (in-person flow), otherwise create a new one
  const meetingId = existingMeetingId
    ?? await writeMeeting({ title, board_id: boardId, user_id: userId, config: fullConfig });

  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set");
  }

  const keyterms: string[] = [];
  if (boardName) keyterms.push(boardName);
  if (memberNames) keyterms.push(...memberNames);

  // Fetch agenda from uploaded document (only useful when reusing an existing meeting)
  const meetingAgenda = await fetchAgendaText(meetingId).catch(() => "");

  const session: LiveSession = {
    meetingId,
    status: "recording",
    config: fullConfig,
    meetingType: "in_person",
    recallBotId: null,
    startedAt: new Date(),
    segmentIndex: 0,
    micStreams: new Map(),
    keyterms,
    transcriptionBuffer: new TranscriptionBuffer(),
    turnBuffer: null,
    speakerTracker: new SpeakerTracker(),
    latencyMonitor: new LatencyMonitor(),
    recentClaims: [],
    metrics: {
      total_chunks: 0,
      total_segments: 0,
      total_claims: 0,
      total_factchecks: 0,
      total_moderations: 0,
      total_suggestions: 0,
      avg_latency_ms: 0,
      session_duration_s: 0,
    },
    pendingPipelines: new Set(),
    meetingAgenda,
    expertProfile: expertProfile ?? null,
    boardName,
    boardSector,
    boardStrategicContext,
    boardId,
    runningSummary: "",
    lastBlindSpotsRunAt: 0,
    lastBlindSpotsExternalAt: 0,
    lastSummaryAt: 0,
  };

  sessions.set(meetingId, session);

  // Multi-mic in-person also runs everything through the speaker-turn buffer:
  // because each mic emits transcripts tagged with its participant's user_id,
  // the buffer's identity-based "speaker change" detection naturally segments
  // the conversation into clean turns even when several streams interleave.
  attachTurnBuffer(session);

  await updateMeetingStatus(meetingId, "recording");
  resetSuggestionState(meetingId);
  if (expertProfile) resetExpertState(expertProfile.id);

  liveLogger.info("In-person multi-mic session started", {
    meeting_id: meetingId,
    config: fullConfig,
  });
  return meetingId;
}

/**
 * Open a Deepgram WebSocket for a participant joining a live meeting from
 * their own device. Idempotent: re-joining the same participant tears down
 * the previous stream first (handles page reloads / reconnects cleanly).
 */
export async function joinMic(
  meetingId: string,
  participantId: string,
  displayName: string
): Promise<void> {
  const session = sessions.get(meetingId);
  if (!session) throw new Error(`No active session for meeting ${meetingId}`);
  if (session.status !== "recording") {
    throw new Error(`Session is ${session.status}, not recording`);
  }
  if (session.meetingType !== "in_person") {
    throw new Error("joinMic is only available for in-person meetings");
  }

  const existing = session.micStreams.get(participantId);
  if (existing) {
    liveLogger.info("Mic re-join: closing previous Deepgram stream", {
      meeting_id: meetingId,
      participant_id: participantId,
    });
    try {
      await existing.client.close();
    } catch (error) {
      liveLogger.warn("Error closing previous Deepgram stream on re-join", {
        meeting_id: meetingId,
        participant_id: participantId,
        error: String(error),
      });
    }
    session.micStreams.delete(participantId);
  }

  if (session.micStreams.size >= MAX_ACTIVE_MICS) {
    throw new Error(
      `Maximum of ${MAX_ACTIVE_MICS} active mics reached for this meeting`
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");

  const client = new DeepgramStreamingClient(apiKey);

  // Each Deepgram WS handles a single physical mic, so we know exactly which
  // participant emitted each transcript. We disable Deepgram's own diarization
  // because there is only one speaker per stream.
  await client.connect({
    sampleRate: 16000,
    language: session.config.language,
    keyterms: session.keyterms,
  });

  client.onFinalTranscript((text, confidence) => {
    try {
      const segment: TranscriptionSegment = {
        speaker: displayName,
        speaker_user_id: participantId,
        content: text,
        timestamp_start: session.startedAt
          ? (Date.now() - session.startedAt.getTime()) / 1000
          : 0,
        timestamp_end: session.startedAt
          ? (Date.now() - session.startedAt.getTime()) / 1000
          : 0,
        confidence,
      };

      const completeSegments = session.transcriptionBuffer.addSegments([segment]);
      if (completeSegments.length === 0) return;

      // Feed into the shared turn buffer; pipelines fire on completed turns,
      // not on every chunk, so the LLM gets full context per speaker.
      if (session.turnBuffer) {
        completeSegments.forEach((seg) => session.turnBuffer!.addSegment(seg));
      }
    } catch (error) {
      liveLogger.error("Error processing final transcript", {
        meeting_id: session.meetingId,
        participant_id: participantId,
        error: String(error),
      });
    }
  });

  session.micStreams.set(participantId, {
    participantId,
    displayName,
    client,
    joinedAt: Date.now(),
    recentChunkArrivals: [],
    totalChunks: 0,
    droppedChunks: 0,
  });

  liveLogger.info("Mic joined", {
    meeting_id: meetingId,
    participant_id: participantId,
    display_name: displayName,
    active_mics: session.micStreams.size,
  });
}

/**
 * Close a participant's Deepgram stream cleanly. Safe to call on a
 * participant that never joined — no-op.
 */
export async function leaveMic(
  meetingId: string,
  participantId: string
): Promise<void> {
  const session = sessions.get(meetingId);
  if (!session) return;

  const stream = session.micStreams.get(participantId);
  if (!stream) return;

  session.micStreams.delete(participantId);

  try {
    await stream.client.close();
  } catch (error) {
    liveLogger.warn("Error closing Deepgram stream on leaveMic", {
      meeting_id: meetingId,
      participant_id: participantId,
      error: String(error),
    });
  }

  liveLogger.info("Mic left", {
    meeting_id: meetingId,
    participant_id: participantId,
    total_chunks: stream.totalChunks,
    dropped_chunks: stream.droppedChunks,
    active_mics: session.micStreams.size,
  });
}

export async function processAudioChunk(
  meetingId: string,
  participantId: string,
  base64Audio: string
): Promise<void> {
  const session = sessions.get(meetingId);
  if (!session) throw new Error(`No active session for meeting ${meetingId}`);
  if (session.status !== "recording") {
    throw new Error(`Session is ${session.status}, not recording`);
  }

  const stream = session.micStreams.get(participantId);
  if (!stream) {
    throw new Error(
      `Participant ${participantId} has not joined a mic for meeting ${meetingId}`
    );
  }

  const now = Date.now();
  // Sliding 1 s window: drop arrivals older than 1 s, then check the cap.
  const cutoff = now - 1000;
  while (
    stream.recentChunkArrivals.length > 0 &&
    stream.recentChunkArrivals[0] < cutoff
  ) {
    stream.recentChunkArrivals.shift();
  }
  if (stream.recentChunkArrivals.length >= RATE_LIMIT_CHUNKS_PER_SEC) {
    stream.droppedChunks++;
    return;
  }
  stream.recentChunkArrivals.push(now);

  stream.totalChunks++;
  session.metrics.total_chunks++;
  stream.client.sendAudio(base64Audio);
}

export async function stopSession(meetingId: string): Promise<void> {
  const session = sessions.get(meetingId);
  if (!session) throw new Error(`No active session for meeting ${meetingId}`);

  // Close every per-participant Deepgram stream; each close() awaits its own
  // CloseStream + final transcripts, so we Promise.allSettled them in parallel.
  if (session.micStreams.size > 0) {
    const closes = Array.from(session.micStreams.values()).map((s) =>
      s.client.close().catch((error: unknown) => {
        liveLogger.warn("Error closing Deepgram stream during stopSession", {
          meeting_id: meetingId,
          participant_id: s.participantId,
          error: String(error),
        });
      })
    );
    await Promise.allSettled(closes);
    session.micStreams.clear();
  }

  // Flush any in-progress speaker turn so its pipelines get queued before we wait.
  if (session.turnBuffer) {
    session.turnBuffer.flushFinal();
  }

  // Wait for all pending pipeline executions
  if (session.pendingPipelines.size > 0) {
    await Promise.allSettled(Array.from(session.pendingPipelines));
  }

  // Flush transcription buffer
  const flushed = session.transcriptionBuffer.flush();
  if (flushed.length > 0) {
    await writeTranscriptionSegments(meetingId, flushed, session.segmentIndex + 1);
  }

  session.status = "completed";
  await updateMeetingStatus(meetingId, "completed");
  sessions.delete(meetingId);
  resetSessionBuffer(meetingId);
  resetModeratorState(meetingId);

  liveLogger.info("Session stopped", {
    meeting_id: meetingId,
    metrics: session.metrics,
  });
}

// --- Visio session management (Recall.ai) ---

/**
 * Start a visio session — no Deepgram, just creates a passive session
 * that waits for transcripts from Recall.ai webhooks.
 */
export async function startVisioSession(
  meetingId: string,
  recallBotId: string,
  config?: Partial<MeetingConfig>,
  expertProfile?: ExpertProfile | null,
  boardName?: string,
  boardSector?: string,
  boardStrategicContext?: string,
  boardId?: string
): Promise<void> {
  const fullConfig: MeetingConfig = {
    language: config?.language ?? "fr",
    enableFactCheck: config?.enableFactCheck ?? true,
    enableModeration: config?.enableModeration ?? true,
    enableSuggestions: config?.enableSuggestions ?? true,
    speakerDiarization: config?.speakerDiarization ?? true,
  };

  // Fetch agenda text from uploaded agenda document (category='agenda')
  const meetingAgenda = await fetchAgendaText(meetingId).catch(() => "");

  const session: LiveSession = {
    meetingId,
    status: "recording",
    config: fullConfig,
    meetingType: "visio",
    recallBotId,
    startedAt: new Date(),
    segmentIndex: 0,
    micStreams: new Map(),
    keyterms: [],
    transcriptionBuffer: new TranscriptionBuffer(),
    turnBuffer: null,
    speakerTracker: new SpeakerTracker(),
    latencyMonitor: new LatencyMonitor(),
    recentClaims: [],
    metrics: {
      total_chunks: 0,
      total_segments: 0,
      total_claims: 0,
      total_factchecks: 0,
      total_moderations: 0,
      total_suggestions: 0,
      avg_latency_ms: 0,
      session_duration_s: 0,
    },
    pendingPipelines: new Set(),
    meetingAgenda,
    expertProfile: expertProfile ?? null,
    boardName,
    boardSector,
    boardStrategicContext,
    boardId,
    runningSummary: "",
    lastBlindSpotsRunAt: 0,
    lastBlindSpotsExternalAt: 0,
    lastSummaryAt: 0,
  };

  sessions.set(meetingId, session);
  attachTurnBuffer(session);

  await updateMeetingStatus(meetingId, "recording");
  resetSuggestionState(meetingId);
  if (expertProfile) resetExpertState(expertProfile.id);

  liveLogger.info("Visio session started (Recall.ai)", {
    meeting_id: meetingId,
    recall_bot_id: recallBotId,
    config: fullConfig,
  });
}

/**
 * Process a transcript segment received from Recall.ai webhook.
 * Feeds it into the same pipelines as Deepgram transcripts.
 */
export async function processVisioTranscript(
  meetingId: string,
  segment: TranscriptionSegment
): Promise<void> {
  const session = sessions.get(meetingId);
  if (!session) {
    liveLogger.warn("processVisioTranscript: no active session", { meetingId });
    return;
  }
  if (session.status !== "recording") return;

  const completeSegments = session.transcriptionBuffer.addSegments([segment]);
  if (completeSegments.length === 0) return;

  // Buffer by speaker turn: persistence and pipelines fire only when the turn
  // ends (speaker change or silence). UI then receives the full turn at once.
  if (session.turnBuffer) {
    completeSegments.forEach((seg) => {
      session.turnBuffer!.addSegment(seg);
    });
    return;
  }

  // Fallback (shouldn't happen — turnBuffer is always attached): persist + run
  // pipelines immediately.
  session.metrics.total_segments += completeSegments.length;
  session.segmentIndex++;
  const transcriptionIds = await writeTranscriptionSegments(
    session.meetingId,
    completeSegments,
    session.segmentIndex
  );
  const pipelinePromise = runPipelines(session, completeSegments, transcriptionIds);
  session.pendingPipelines.add(pipelinePromise);
  pipelinePromise.finally(() => session.pendingPipelines.delete(pipelinePromise));
}

export function getSessionState(meetingId: string): SessionState | null {
  const session = sessions.get(meetingId);
  if (!session) return null;

  return {
    meeting_id: session.meetingId,
    status: session.status,
    started_at: session.startedAt?.toISOString() ?? null,
    meeting_type: session.meetingType,
    recall_bot_id: session.recallBotId,
    metrics: {
      ...session.metrics,
      session_duration_s: session.startedAt
        ? (Date.now() - session.startedAt.getTime()) / 1000
        : 0,
    },
  };
}

export function getActiveSessions(): string[] {
  return Array.from(sessions.keys());
}

export interface ConnectedMic {
  participant_id: string;
  display_name: string;
  joined_at: number;
  total_chunks: number;
  dropped_chunks: number;
  is_connected: boolean;
}

/** Récupère le contexte minimal d'une session (utilisé par le mode manuel angles morts) */
export function getBlindSpotsContext(meetingId: string): {
  boardId: string | null;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  recentTranscript: string;
} | null {
  const session = sessions.get(meetingId);
  if (!session) return null;
  const recentTranscript = session.transcriptionBuffer
    .getRecent(15)
    .map((s) => s.content)
    .join(" ");
  return {
    boardId: session.boardId ?? null,
    boardName: session.boardName,
    boardSector: session.boardSector,
    boardStrategicContext: session.boardStrategicContext,
    recentTranscript,
  };
}

export function getConnectedMics(meetingId: string): ConnectedMic[] {
  const session = sessions.get(meetingId);
  if (!session) return [];
  return Array.from(session.micStreams.values()).map((s) => ({
    participant_id: s.participantId,
    display_name: s.displayName,
    joined_at: s.joinedAt,
    total_chunks: s.totalChunks,
    dropped_chunks: s.droppedChunks,
    is_connected: s.client.isConnected(),
  }));
}

// --- Internal helpers ---

function attachTurnBuffer(session: LiveSession): void {
  session.turnBuffer = new SpeakerTurnBuffer((turn: SpeakerTurn) => {
    const chunks = turn.buffered.map((b) => b.segment);
    if (chunks.length === 0) return;

    // Carry the speaker user_id from the first chunk; per turn it's identical
    // because the buffer flushed on speaker change.
    const merged: TranscriptionSegment = {
      speaker: turn.speaker,
      speaker_user_id: chunks[0].speaker_user_id ?? null,
      content: chunks.map((c) => c.content.trim()).filter(Boolean).join(" "),
      timestamp_start: chunks[0].timestamp_start,
      timestamp_end: chunks[chunks.length - 1].timestamp_end,
      confidence:
        chunks.reduce((sum, c) => sum + c.confidence, 0) / chunks.length,
    };

    const turnPromise = (async () => {
      session.metrics.total_segments += 1;
      session.segmentIndex++;
      const ids = await writeTranscriptionSegments(
        session.meetingId,
        [merged],
        session.segmentIndex
      );
      await runPipelines(session, [merged], ids);
    })();
    session.pendingPipelines.add(turnPromise);
    turnPromise.finally(() => session.pendingPipelines.delete(turnPromise));
  });
}

// --- Pipeline execution ---

async function runPipelines(
  session: LiveSession,
  completeSegments: TranscriptionSegment[],
  transcriptionIds: string[]
): Promise<void> {
  const pipelinePromises: Promise<void>[] = [];

  if (session.config.enableFactCheck) {
    pipelinePromises.push(
      runWithTimeout(
        async () => {
          const claims = await detectClaims(completeSegments);
          if (claims.length > 0) {
            session.recentClaims.push(...claims);
            if (session.recentClaims.length > 20) {
              session.recentClaims = session.recentClaims.slice(-20);
            }
            session.metrics.total_claims += claims.length;

            const recentTranscript = session.transcriptionBuffer
              .getRecent(15)
              .map((s) => s.content)
              .join(" ");
            const results = await factCheckClaims(
              claims,
              session.meetingId,
              recentTranscript,
              session.meetingAgenda,
              session.boardSector,
            );
            session.metrics.total_factchecks += results.length;
            await writeFactChecks(session.meetingId, results, transcriptionIds);
          }
        },
        FACTCHECK_TIMEOUT_MS,
        "fact-check"
      )
    );
  }

  if (session.config.enableModeration) {
    pipelinePromises.push(
      runWithTimeout(
        async () => {
          const allSegments = session.transcriptionBuffer.getAll();
          const recentTranscriptModeration = session.transcriptionBuffer
            .getRecent(15)
            .map((s) => s.content)
            .join(" ");
          const alerts = await moderate(
            completeSegments,
            allSegments,
            session.speakerTracker,
            session.meetingAgenda,
            session.meetingId,
            /* participantIds */ [], // TODO: pass real participant IDs when the session carries them — silence detection stays inert until then
            recentTranscriptModeration,
            session.boardSector,
          );
          if (alerts.length > 0) {
            session.metrics.total_moderations += alerts.length;
            await writeModerationAlerts(session.meetingId, alerts);
          }
        },
        PIPELINE_TIMEOUT_MS,
        "moderation"
      )
    );
  }

  if (session.config.enableSuggestions) {
    pipelinePromises.push(
      runWithTimeout(
        async () => {
          const recentSegments = session.transcriptionBuffer.getRecent(15);
          const suggestions = await generateSuggestions(
            recentSegments,
            session.recentClaims.slice(-5),
            session.meetingId,
            session.meetingAgenda,
            session.boardName,
            session.boardSector,
            session.boardStrategicContext,
          );
          if (suggestions.length > 0) {
            session.metrics.total_suggestions += suggestions.length;
            await writeSuggestions(session.meetingId, suggestions);
          }
        },
        PIPELINE_TIMEOUT_MS,
        "suggestions"
      )
    );
  }

  // Pipelines 5 & 6 (Blind Spots + Expert Panel) sont exclusivement déclenchés
  // manuellement via les routes API — pas d'appel automatique ici.

  // Running summary — fire-and-forget every 15 min to keep expert/blind-spots context fresh.
  const now = Date.now();
  const sessionAge = session.startedAt ? now - session.startedAt.getTime() : 0;
  if (
    sessionAge > SUMMARY_INTERVAL_MS &&
    now - session.lastSummaryAt > SUMMARY_INTERVAL_MS
  ) {
    session.lastSummaryAt = now; // set immediately to prevent double-fire
    const allSegments = session.transcriptionBuffer.getAll();
    if (allSegments.length >= 10) {
      const recentText = allSegments
        .slice(-30)
        .map((s) => `${s.speaker}: ${s.content}`)
        .join("\n");
      generateRunningSummary(recentText, session.runningSummary).then(
        (summary) => {
          if (summary) session.runningSummary = summary;
        },
        (err) => {
          liveLogger.warn("Running summary generation failed", { error: String(err) });
        }
      );
    }
  }

  await Promise.allSettled(pipelinePromises);
}

async function runWithTimeout(
  fn: () => Promise<void>,
  timeoutMs: number,
  name: string
): Promise<void> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} pipeline timeout`)), timeoutMs)
      ),
    ]);
  } catch (error) {
    liveLogger.warn(`Pipeline ${name} failed`, {
      error: String(error),
    });
  }
}
