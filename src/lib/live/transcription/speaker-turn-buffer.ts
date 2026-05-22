import { TranscriptionSegment } from "../schemas";
import { liveLogger } from "../utils/logger";

const DEFAULT_SILENCE_TIMEOUT_MS = 8_000;

interface BufferedSegment {
  segment: TranscriptionSegment;
}

export interface SpeakerTurn {
  speaker: string | null;
  buffered: BufferedSegment[];
  startedAt: number;
  endedAt: number;
  reason: "speaker_change" | "silence" | "session_end";
}

type TurnCompleteCallback = (turn: SpeakerTurn) => void;

/**
 * Accumulates transcription segments by speaker and emits a completed
 * "turn" when the speaker changes or falls silent long enough.
 *
 * Used in visio mode where Recall.ai provides reliable speaker attribution
 * per webhook. Running fact-check per full turn (vs per tiny webhook chunk)
 * gives the LLM proper context and cuts noisy partial claims.
 */
export class SpeakerTurnBuffer {
  private currentSpeakerKey: string | null = null;
  private currentSpeakerLabel: string | null = null;
  private buffered: BufferedSegment[] = [];
  private turnStartedAt: number = 0;
  private silenceTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onTurnComplete: TurnCompleteCallback,
    private readonly silenceTimeoutMs: number = DEFAULT_SILENCE_TIMEOUT_MS
  ) {}

  addSegment(segment: TranscriptionSegment): void {
    // Prefer the canonical user_id for identity (multi-mic in-person mode);
    // fall back to the human-readable speaker label (visio / legacy).
    const incomingKey = segment.speaker_user_id ?? segment.speaker ?? null;
    const incomingLabel = segment.speaker ?? null;

    const isNewTurn = this.buffered.length === 0;
    const isSpeakerChange =
      !isNewTurn && this.currentSpeakerKey !== incomingKey;

    if (isSpeakerChange) {
      this.emitTurn("speaker_change");
    }

    if (this.buffered.length === 0) {
      this.currentSpeakerKey = incomingKey;
      this.currentSpeakerLabel = incomingLabel;
      this.turnStartedAt = Date.now();
    }

    this.buffered.push({ segment });
    this.resetSilenceTimer();
  }

  /**
   * Flush the currently buffered turn (called on session stop).
   */
  flushFinal(): void {
    this.clearSilenceTimer();
    if (this.buffered.length > 0) {
      this.emitTurn("session_end");
    }
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.emitTurn("silence");
    }, this.silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private emitTurn(reason: SpeakerTurn["reason"]): void {
    if (this.buffered.length === 0) return;

    const turn: SpeakerTurn = {
      speaker: this.currentSpeakerLabel,
      buffered: this.buffered,
      startedAt: this.turnStartedAt,
      endedAt: Date.now(),
      reason,
    };

    this.buffered = [];
    this.currentSpeakerKey = null;
    this.currentSpeakerLabel = null;
    this.clearSilenceTimer();

    liveLogger.info("Speaker turn complete", {
      speaker: turn.speaker,
      segments: turn.buffered.length,
      duration_ms: turn.endedAt - turn.startedAt,
      reason,
    });

    try {
      this.onTurnComplete(turn);
    } catch (error) {
      liveLogger.error("Speaker turn callback threw", {
        speaker: turn.speaker,
        reason,
        error: String(error),
      });
    }
  }
}
