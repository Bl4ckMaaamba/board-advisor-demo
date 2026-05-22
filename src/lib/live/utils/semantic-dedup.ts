/**
 * Semantic dedup buffer for live alerts.
 *
 * Maintains a per-session, per-pipeline rolling window of published alerts.
 * Before publishing a new candidate, callers ask `isDuplicate(...)`. If false,
 * they call `recordPublication(...)` after writing to DB.
 *
 * Two comparison modes:
 *  - text-based (factcheck, suggestion): Jaccard similarity ≥ 0.6 on significant tokens
 *  - moderation: same `type` + overlapping participants set
 *
 * Buffer entries older than BUFFER_TTL_MS are pruned on each access.
 */

const BUFFER_TTL_MS = 10 * 60_000;
const JACCARD_THRESHOLD = 0.6;
const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou",
  "à", "au", "aux", "en", "dans", "pour", "par", "sur", "avec",
  "qui", "que", "quoi", "dont", "où", "ce", "cette", "ces",
  "est", "sont", "été", "être", "avoir", "a", "ont", "il", "elle",
  "ils", "elles", "on", "se", "sa", "son", "ses", "leur", "leurs",
  "plus", "moins", "très", "bien", "mal", "ne", "pas", "non",
  "the", "an", "and", "or", "of", "to", "in", "for", "is",
]);

export type PipelineKind = "factcheck" | "moderation" | "suggestion";

export interface FactcheckOrSuggestionCandidate {
  tokens: string;
  /** Test-only: override timestamp to simulate aging. Ignored if undefined. */
  _testTimestamp?: number;
}

export interface ModerationCandidate {
  type: string;
  participants: string[];
  _testTimestamp?: number;
}

export type Candidate = FactcheckOrSuggestionCandidate | ModerationCandidate;

interface Entry {
  ts: number;
  tokens?: Set<string>;
  type?: string;
  participants?: Set<string>;
}

type SessionBuffers = Map<PipelineKind, Entry[]>;
const buffers = new Map<string, SessionBuffers>();

function getBuffer(meetingId: string, pipeline: PipelineKind): Entry[] {
  let session = buffers.get(meetingId);
  if (!session) {
    session = new Map();
    buffers.set(meetingId, session);
  }
  let bucket = session.get(pipeline);
  if (!bucket) {
    bucket = [];
    session.set(pipeline, bucket);
  }
  return bucket;
}

// Entries are always appended in chronological order (ts = Date.now() in production).
// _testTimestamp is only used to back-date the very first entry in a freshSession(); mixing
// back-dated and live entries in the same bucket is not supported.
function pruneOld(bucket: Entry[]): Entry[] {
  const cutoff = Date.now() - BUFFER_TTL_MS;
  let i = 0;
  while (i < bucket.length && bucket[i].ts < cutoff) i++;
  if (i > 0) bucket.splice(0, i);
  return bucket;
}

function tokenize(text: string): Set<string> {
  // Strip currency/unit suffixes before general cleanup so "130M€" normalizes to "130"
  const lower = text
    .toLowerCase()
    .replace(/(\d+)[mkb]?[€$£¥%]/g, "$1")
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]+/g, " ");
  const tokens = lower.split(/\s+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  Array.from(ta).forEach((t) => { if (tb.has(t)) inter++; });
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isDuplicate(
  meetingId: string,
  pipeline: "moderation",
  candidate: Candidate
): boolean;
export function isDuplicate(
  meetingId: string,
  pipeline: "factcheck" | "suggestion",
  candidate: FactcheckOrSuggestionCandidate
): boolean;
export function isDuplicate(
  meetingId: string,
  pipeline: PipelineKind,
  candidate: Candidate
): boolean {
  const bucket = pruneOld(getBuffer(meetingId, pipeline));

  if (pipeline === "moderation") {
    const c = candidate as ModerationCandidate;
    const cParticipants = new Set(c.participants);
    return bucket.some((e) => {
      if (e.type !== c.type) return false;
      if (!e.participants || e.participants.size === 0) return false;
      if (Array.from(e.participants).some((p) => cParticipants.has(p))) return true;
      return false;
    });
  }

  const c = candidate as FactcheckOrSuggestionCandidate;
  const cTokens = tokenize(c.tokens);
  if (cTokens.size === 0) return false;
  return bucket.some((e) => {
    if (!e.tokens || e.tokens.size === 0) return false;
    let inter = 0;
    Array.from(cTokens).forEach((t) => { if (e.tokens!.has(t)) inter++; });
    const union = cTokens.size + e.tokens.size - inter;
    const j = union === 0 ? 0 : inter / union;
    return j >= JACCARD_THRESHOLD;
  });
}

export function recordPublication(
  meetingId: string,
  pipeline: "moderation",
  candidate: Candidate
): void;
export function recordPublication(
  meetingId: string,
  pipeline: "factcheck" | "suggestion",
  candidate: FactcheckOrSuggestionCandidate
): void;
export function recordPublication(
  meetingId: string,
  pipeline: PipelineKind,
  candidate: Candidate
): void {
  const bucket = pruneOld(getBuffer(meetingId, pipeline));
  const ts = candidate._testTimestamp ?? Date.now();

  if (pipeline === "moderation") {
    const c = candidate as ModerationCandidate;
    bucket.push({ ts, type: c.type, participants: new Set(c.participants) });
  } else {
    const c = candidate as FactcheckOrSuggestionCandidate;
    bucket.push({ ts, tokens: tokenize(c.tokens) });
  }
}

export function resetSessionBuffer(meetingId: string): void {
  buffers.delete(meetingId);
}
