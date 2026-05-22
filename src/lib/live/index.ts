export {
  startSession,
  startVisioSession,
  joinMic,
  leaveMic,
  processAudioChunk,
  processVisioTranscript,
  stopSession,
  getSessionState,
  getActiveSessions,
  getConnectedMics,
  getBlindSpotsContext,
} from "./orchestrator";

export type { ConnectedMic } from "./orchestrator";

export type {
  MeetingConfig,
  MeetingStatus,
  MeetingTypeEnum,
  RecallBotStatusEnum,
  SessionState,
  SessionMetrics,
  TranscriptionSegment,
  FactCheckResult,
  ModerationAlert,
  Suggestion,
  Verdict,
} from "./schemas";
