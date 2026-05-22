import { ModerationAlert, TranscriptionSegment } from "../schemas";
import { SpeakerTracker } from "../utils/speaker-tracker";
import { liveLogger } from "../utils/logger";
import { evaluateImportance } from "../utils/importance-filter";
import { isDuplicate, recordPublication } from "../utils/semantic-dedup";

const INTERRUPTION_OVERLAP_THRESHOLD_S = 0.8;
const INTERRUPTION_WINDOW_MS = 5 * 60_000;
const INTERRUPTION_MIN_COUNT = 3;

const MONOPOLISATION_WINDOW_MS = 10 * 60_000;
const MONOPOLISATION_RATIO = 0.75;
const MONOPOLISATION_MIN_DATA_S = 60;

const SILENCE_THRESHOLD_MS = 20 * 60_000;

interface InterruptionEvent {
  ts: number;
  interrupter: string;
  interrupted: string;
}

interface ModeratorState {
  interruptions: InterruptionEvent[];
  lastSpeakingByUser: Map<string, number>;
  lastSegment: TranscriptionSegment | null;
}

const states = new Map<string, ModeratorState>();
function getState(meetingId: string): ModeratorState {
  let s = states.get(meetingId);
  if (!s) {
    s = { interruptions: [], lastSpeakingByUser: new Map(), lastSegment: null };
    states.set(meetingId, s);
  }
  return s;
}

export function resetModeratorState(meetingId: string): void {
  states.delete(meetingId);
}

function pruneInterruptions(state: ModeratorState): void {
  const cutoff = Date.now() - INTERRUPTION_WINDOW_MS;
  state.interruptions = state.interruptions.filter((e) => e.ts >= cutoff);
}

function ingestInterruptions(state: ModeratorState, newSegments: TranscriptionSegment[]): void {
  const now = Date.now();
  for (const curr of newSegments) {
    const prev = state.lastSegment;
    if (
      prev &&
      prev.speaker &&
      curr.speaker &&
      prev.speaker !== curr.speaker &&
      curr.timestamp_start < prev.timestamp_end - INTERRUPTION_OVERLAP_THRESHOLD_S
    ) {
      state.interruptions.push({
        ts: now,
        interrupter: curr.speaker,
        interrupted: prev.speaker,
      });
    }
    state.lastSegment = curr;
  }
}

function detectRepeatedInterruption(state: ModeratorState): ModerationAlert | null {
  pruneInterruptions(state);
  const counts = new Map<string, { count: number; interrupter: string; interrupted: string }>();
  for (const e of state.interruptions) {
    const key = `${e.interrupter}>${e.interrupted}`;
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { count: 1, interrupter: e.interrupter, interrupted: e.interrupted });
  }
  let worst: { count: number; interrupter: string; interrupted: string } | null = null;
  for (const c of Array.from(counts.values())) {
    if (c.count >= INTERRUPTION_MIN_COUNT && (!worst || c.count > worst.count)) worst = c;
  }
  if (!worst) return null;
  return {
    type: "interruption",
    severity: "warning",
    message: `${worst.interrupter} a coupé ${worst.interrupted} à plusieurs reprises`,
    speaker: worst.interrupter,
    details: { interrupted_speaker: worst.interrupted, count: worst.count },
  };
}

function detectMonopolisation(tracker: SpeakerTracker): ModerationAlert | null {
  const stats = tracker.getStatsInWindow(MONOPOLISATION_WINDOW_MS);
  const totalTime = stats.reduce((sum, s) => sum + s.duration, 0);
  if (totalTime < MONOPOLISATION_MIN_DATA_S) return null;
  for (const stat of stats) {
    const ratio = stat.duration / totalTime;
    if (ratio > MONOPOLISATION_RATIO) {
      return {
        type: "speaking_time",
        severity: "info",
        message: `${stat.speaker} monopolise la parole sur les 10 dernières minutes (${Math.round(ratio * 100)}%)`,
        speaker: stat.speaker,
        details: { speaking_ratio: ratio, duration_seconds: stat.duration, window_seconds: totalTime },
      };
    }
  }
  return null;
}

function detectAbnormalSilence(
  state: ModeratorState,
  newSegments: TranscriptionSegment[],
  participantIds: string[]
): ModerationAlert | null {
  const now = Date.now();
  for (const seg of newSegments) {
    if (seg.speaker) state.lastSpeakingByUser.set(seg.speaker, now);
  }
  for (const participant of participantIds) {
    const last = state.lastSpeakingByUser.get(participant);
    const elapsed = last ? now - last : Number.POSITIVE_INFINITY;
    if (elapsed >= SILENCE_THRESHOLD_MS) {
      return {
        type: "speaking_time",
        severity: "info",
        message: `${participant} n'est pas intervenu depuis plus de 20 minutes`,
        speaker: participant,
        details: { silent_minutes: Math.round(elapsed / 60_000) },
      };
    }
  }
  return null;
}

export async function moderate(
  newSegments: TranscriptionSegment[],
  _allSegments: TranscriptionSegment[],
  speakerTracker: SpeakerTracker,
  agenda: string,
  meetingId: string,
  participantIds: string[],
  recentTranscript: string,
  boardSector?: string
): Promise<ModerationAlert[]> {
  if (newSegments.length === 0) return [];
  const startTime = Date.now();
  const state = getState(meetingId);

  for (const seg of newSegments) {
    if (seg.speaker) {
      speakerTracker.addSpeaking(seg.speaker, seg.timestamp_end - seg.timestamp_start);
    }
  }
  ingestInterruptions(state, newSegments);

  const candidates: { alert: ModerationAlert; criterion: string; participants: string[] }[] = [];

  const interruption = detectRepeatedInterruption(state);
  if (interruption) {
    candidates.push({
      alert: interruption,
      criterion: "interruption_repetee",
      participants: [
        interruption.speaker ?? "",
        (interruption.details?.interrupted_speaker as string) ?? "",
      ].filter(Boolean),
    });
  }

  const monopolisation = detectMonopolisation(speakerTracker);
  if (monopolisation) {
    candidates.push({
      alert: monopolisation,
      criterion: "monopolisation_persistante",
      participants: [monopolisation.speaker ?? ""].filter(Boolean),
    });
  }

  const silence = detectAbnormalSilence(state, newSegments, participantIds);
  if (silence) {
    candidates.push({
      alert: silence,
      criterion: "silence_anormal",
      participants: [silence.speaker ?? ""].filter(Boolean),
    });
  }

  const published: ModerationAlert[] = [];
  for (const c of candidates) {
    if (
      isDuplicate(meetingId, "moderation", {
        type: c.criterion,
        participants: c.participants,
      })
    ) {
      liveLogger.info("alert_dropped", {
        pipeline: "moderation",
        meeting_id: meetingId,
        reason: "semantic_dedup",
        candidate_summary: c.alert.message.slice(0, 80),
      });
      continue;
    }
    const decision = await evaluateImportance({
      pipeline: "moderation",
      meetingId,
      recentTranscript,
      boardSector,
      agendaText: agenda,
      candidate: c.alert.message,
      detectedCriterionHint: c.criterion,
    });
    if (!decision.publish) continue;
    recordPublication(meetingId, "moderation", { type: c.criterion, participants: c.participants });
    published.push(c.alert);
  }

  if (published.length > 0) {
    liveLogger.info("moderation_published", {
      meeting_id: meetingId,
      count: published.length,
      types: published.map((a) => a.type),
      latency_ms: Date.now() - startTime,
    });
  }

  return published;
}
