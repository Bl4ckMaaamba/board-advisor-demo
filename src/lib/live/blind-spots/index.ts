/**
 * Module Blind Spots — pipeline angles morts.
 * Spec: specs/features/blind-spots.md
 */

export type {
  BlindSpotType,
  BlindSpotSeverity,
  BlindSpotDomain,
  BlindSpotSourceType,
  BlindSpotSourceDocs,
  BlindSpotSourceMemory,
  BlindSpotSourceExternal,
  BlindSpotSource,
  BlindSpotResult,
  BlindSpotEntry,
  BlindSpotStage2Output,
} from "./blind-spots-types";

export {
  canEmit,
  canEmitForDomain,
  isDuplicate,
  recordEmission,
  getRecentEmissionsText,
  resetSession,
} from "./blind-spots-dedup";
