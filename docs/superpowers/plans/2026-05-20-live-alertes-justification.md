# Live Alerts — Justification-Gated Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 3 auto live pipelines (fact-check, moderation, suggestions) from a rate-limited model to an importance-gated model — silence by default, alert only when there is a justified reason.

**Architecture:** Two shared utilities (`importance-filter.ts` LLM scorer + `semantic-dedup.ts` rolling buffer) gate every alert before publication. Each pipeline keeps its detection but routes its candidates through both gates. The moderator and suggester are refactored from event-driven to pattern-driven. UI and schema unchanged.

**Tech Stack:** Next.js 14, TypeScript, `@anthropic-ai/sdk` (Haiku 4.5), `liveLogger` (structured logs), `npx tsx` for ad-hoc test runs (no framework added).

**Spec:** `docs/superpowers/specs/2026-05-20-live-alertes-justification-design.md`

---

## File Map

**New files:**
- `src/lib/live/utils/semantic-dedup.ts` — per-session, per-pipeline rolling buffer (10 min) with Jaccard similarity and a type-aware comparator
- `src/lib/live/utils/importance-filter.ts` — Haiku-backed scorer (1–10 + criterion) with per-pipeline prompt registry and `PUBLISH_THRESHOLD`
- `src/lib/live/utils/__tests__/semantic-dedup.test.ts` — pure-fn test script
- `src/lib/live/utils/__tests__/claim-detector-regex.test.ts` — pure-fn test script (regex behaviour after tightening)

**Modified files:**
- `src/lib/live/pipelines/claim-detector.ts` — tighten regex pre-filter
- `src/lib/live/pipelines/fact-checker.ts` — gate writes with filter + dedup
- `src/lib/live/pipelines/moderator.ts` — refactor to pattern-driven detectors, gate with filter + dedup
- `src/lib/live/pipelines/suggester.ts` — refactor to reason-driven detection (no temporal cooldown), gate with filter + dedup
- `src/lib/live/orchestrator.ts` — pass `meetingId` to pipelines that didn't already have it (for dedup buffer keying), wire stop cleanup

---

## Task 1: Semantic dedup module (pure, fully tested)

**Files:**
- Create: `src/lib/live/utils/semantic-dedup.ts`
- Test: `src/lib/live/utils/__tests__/semantic-dedup.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/lib/live/utils/__tests__/semantic-dedup.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  jaccardSimilarity,
  isDuplicate,
  recordPublication,
  resetSessionBuffer,
} from "../semantic-dedup";

const MEETING_ID = "meet-test";
const PIPELINE = "factcheck" as const;

function freshSession() {
  resetSessionBuffer(MEETING_ID);
}

// 1. Jaccard similarity sanity
{
  assert.equal(jaccardSimilarity("", ""), 0);
  assert.equal(jaccardSimilarity("the cat sat", "the cat sat"), 1);
  assert.ok(jaccardSimilarity("le chiffre d'affaires a augmenté de 30%", "le ca a grimpé de 30%") < 0.6);
  assert.ok(jaccardSimilarity("acquisition de TotalEnergies", "TotalEnergies a fait une acquisition") >= 0.6);
  console.log("✓ jaccardSimilarity");
}

// 2. Empty buffer → never duplicate
{
  freshSession();
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "premier exemple" }), false);
  console.log("✓ empty buffer never duplicate");
}

// 3. After recording, near-identical candidate is duplicate
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "Le chiffre d'affaires est passé de 100 à 130 millions d'euros" });
  const isDup = isDuplicate(MEETING_ID, PIPELINE, { tokens: "Le chiffre d'affaires est passé de 100 à 130M€" });
  assert.equal(isDup, true);
  console.log("✓ near-identical text deduped");
}

// 4. Different topic is not duplicate
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "acquisition de TotalEnergies" });
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "nouveau directeur juridique nommé hier" }), false);
  console.log("✓ different topic not deduped");
}

// 5. Per-pipeline isolation
{
  freshSession();
  recordPublication(MEETING_ID, "factcheck", { tokens: "claim text shared" });
  assert.equal(isDuplicate(MEETING_ID, "moderation", { tokens: "claim text shared" }), false);
  console.log("✓ pipelines are isolated");
}

// 6. Per-session isolation
{
  resetSessionBuffer("a");
  resetSessionBuffer("b");
  recordPublication("a", PIPELINE, { tokens: "shared content" });
  assert.equal(isDuplicate("b", PIPELINE, { tokens: "shared content" }), false);
  console.log("✓ sessions are isolated");
}

// 7. Moderation comparator: type + overlapping participants
{
  freshSession();
  recordPublication(MEETING_ID, "moderation", {
    type: "interruption_repetee",
    participants: ["alice", "bob"],
  });
  // Same type + overlapping participant → duplicate
  assert.equal(
    isDuplicate(MEETING_ID, "moderation", { type: "interruption_repetee", participants: ["bob", "carol"] }),
    true
  );
  // Same participants but different type → not duplicate
  assert.equal(
    isDuplicate(MEETING_ID, "moderation", { type: "monopolisation_persistante", participants: ["alice"] }),
    false
  );
  console.log("✓ moderation comparator works");
}

// 8. Entries older than 10 min expire
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "old content", _testTimestamp: Date.now() - 11 * 60_000 });
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "old content" }), false);
  console.log("✓ entries expire after 10 min");
}

console.log("\nAll semantic-dedup tests passed.");
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npx tsx src/lib/live/utils/__tests__/semantic-dedup.test.ts`
Expected: `Cannot find module '../semantic-dedup'` error.

- [ ] **Step 1.3: Implement the module**

Create `src/lib/live/utils/semantic-dedup.ts`:

```ts
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
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "is",
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

function pruneOld(bucket: Entry[]): Entry[] {
  const cutoff = Date.now() - BUFFER_TTL_MS;
  let i = 0;
  while (i < bucket.length && bucket[i].ts < cutoff) i++;
  if (i > 0) bucket.splice(0, i);
  return bucket;
}

function tokenize(text: string): Set<string> {
  const lower = text.toLowerCase().replace(/[^\p{L}\p{N}\s%€$]+/gu, " ");
  const tokens = lower.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

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
      for (const p of e.participants) if (cParticipants.has(p)) return true;
      return false;
    });
  }

  const c = candidate as FactcheckOrSuggestionCandidate;
  const cTokens = tokenize(c.tokens);
  if (cTokens.size === 0) return false;
  return bucket.some((e) => {
    if (!e.tokens || e.tokens.size === 0) return false;
    let inter = 0;
    for (const t of cTokens) if (e.tokens.has(t)) inter++;
    const union = cTokens.size + e.tokens.size - inter;
    const j = union === 0 ? 0 : inter / union;
    return j >= JACCARD_THRESHOLD;
  });
}

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
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npx tsx src/lib/live/utils/__tests__/semantic-dedup.test.ts`
Expected: 8 lines `✓ ...` then `All semantic-dedup tests passed.` Exit code 0.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/live/utils/semantic-dedup.ts src/lib/live/utils/__tests__/semantic-dedup.test.ts
git commit -m "feat(live): add semantic dedup buffer for alert gating"
```

---

## Task 2: Importance filter module (LLM, smoke-only)

**Files:**
- Create: `src/lib/live/utils/importance-filter.ts`

This module calls Claude Haiku and returns a score + criterion. It can't reasonably be unit-tested without mocking the SDK, so we ship a runtime smoke check via the dev server in Task 7. The module itself is small and contains the per-pipeline criterion lists and prompts.

- [ ] **Step 2.1: Implement the module**

Create `src/lib/live/utils/importance-filter.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { liveLogger } from "./logger";
import { parseLlmJson } from "./parse-llm-json";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const PUBLISH_THRESHOLD = 7;

export const FACTCHECK_CRITERIA = ["chiffre_materiel", "allegation_a_effet", "conflit_docs"] as const;
export const MODERATION_CRITERIA = ["interruption_repetee", "monopolisation_persistante", "silence_anormal"] as const;
export const SUGGESTION_CRITERIA = [
  "trou_agenda",
  "decision_sans_suite",
  "info_docs_ignoree",
  "enjeu_structurel_manque",
] as const;

export type FactcheckCriterion = (typeof FACTCHECK_CRITERIA)[number];
export type ModerationCriterion = (typeof MODERATION_CRITERIA)[number];
export type SuggestionCriterion = (typeof SUGGESTION_CRITERIA)[number];

export type Pipeline = "factcheck" | "moderation" | "suggestion";

export interface FilterContext {
  pipeline: Pipeline;
  meetingId: string;
  recentTranscript: string;
  boardSector?: string;
  agendaText?: string;
  /** Free-form description of the candidate. */
  candidate: string;
  /** Pre-detected motif for moderation, used to constrain the LLM's criterion choice. */
  detectedCriterionHint?: string;
}

export interface FilterDecision {
  publish: boolean;
  score: number;
  criterion: string | null;
  reason: "score_below_threshold" | "out_of_criteria" | "llm_error" | "ok";
}

const CRITERIA_BY_PIPELINE: Record<Pipeline, readonly string[]> = {
  factcheck: FACTCHECK_CRITERIA,
  moderation: MODERATION_CRITERIA,
  suggestion: SUGGESTION_CRITERIA,
};

function buildPrompt(ctx: FilterContext): string {
  const allowedCriteria = CRITERIA_BY_PIPELINE[ctx.pipeline].join(", ");
  const agendaSection = ctx.agendaText && ctx.agendaText.trim().length > 0
    ? `\n\nOrdre du jour de la réunion :\n${ctx.agendaText.trim()}`
    : "";
  const sectorSection = ctx.boardSector ? `\nSecteur du board : ${ctx.boardSector}` : "";
  const hintSection = ctx.detectedCriterionHint
    ? `\nMotif pré-détecté côté code : ${ctx.detectedCriterionHint}`
    : "";

  const intro = ({
    factcheck: "Tu décides si une affirmation vaut la peine d'être fact-checkée pour un conseil d'administration.",
    moderation: "Tu décides si un motif de modération mérite une alerte au board.",
    suggestion: "Tu décides si une suggestion mérite d'être affichée au board.",
  } as const)[ctx.pipeline];

  return `${intro}

Tu réponds UNIQUEMENT en JSON :
{ "score": 1-10, "criterion": "<un des critères autorisés ou null>" }

Critères autorisés (renvoie EXACTEMENT un de ces strings, ou null si aucun ne s'applique) :
${allowedCriteria}

Règle d'or : silence par défaut. Le public est composé d'administrateurs senior, ils n'acceptent pas le bruit. Score ≥ 7 seulement si la raison est concrète, formulable, et propre à la situation.${sectorSection}${agendaSection}${hintSection}

Extrait récent du transcript :
"""
${ctx.recentTranscript.slice(-1500)}
"""

Candidat à évaluer :
"""
${ctx.candidate}
"""

Réponds avec le JSON, rien d'autre.`;
}

export async function evaluateImportance(ctx: FilterContext): Promise<FilterDecision> {
  const allowed = new Set<string>(CRITERIA_BY_PIPELINE[ctx.pipeline]);
  const startTime = Date.now();

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = parseLlmJson(content) as { score?: number; criterion?: string | null };

    const score = typeof parsed.score === "number" ? parsed.score : 0;
    const criterion = typeof parsed.criterion === "string" ? parsed.criterion : null;

    let decision: FilterDecision;
    if (score < PUBLISH_THRESHOLD) {
      decision = { publish: false, score, criterion, reason: "score_below_threshold" };
    } else if (!criterion || !allowed.has(criterion)) {
      decision = { publish: false, score, criterion, reason: "out_of_criteria" };
    } else {
      decision = { publish: true, score, criterion, reason: "ok" };
    }

    liveLogger.info(decision.publish ? "alert_published" : "alert_dropped", {
      pipeline: ctx.pipeline,
      meeting_id: ctx.meetingId,
      reason: decision.reason,
      score: decision.score,
      criterion: decision.criterion,
      candidate_summary: ctx.candidate.slice(0, 80),
      latency_ms: Date.now() - startTime,
    });

    return decision;
  } catch (error) {
    liveLogger.error("importance_filter_error", {
      pipeline: ctx.pipeline,
      meeting_id: ctx.meetingId,
      error: String(error),
    });
    // Fail-closed: if the LLM is unreachable, we drop rather than spam.
    return { publish: false, score: 0, criterion: null, reason: "llm_error" };
  }
}
```

- [ ] **Step 2.2: Type-check the module**

Run: `npx tsc --noEmit src/lib/live/utils/importance-filter.ts`
Expected: no output (success). If errors about imports, ensure relative paths to `./logger` and `./parse-llm-json` resolve — these files already exist in `src/lib/live/utils/`.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/live/utils/importance-filter.ts
git commit -m "feat(live): add Haiku-backed importance filter for alert gating"
```

---

## Task 3: Tighten claim-detector regex pre-filter

**Files:**
- Modify: `src/lib/live/pipelines/claim-detector.ts:16-37`
- Test: `src/lib/live/utils/__tests__/claim-detector-regex.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/live/utils/__tests__/claim-detector-regex.test.ts`:

```ts
import assert from "node:assert/strict";
import { preFilterClaim } from "../../pipelines/claim-detector";

// MUST match — genuinely fact-checkable
const MUST_MATCH = [
  "Le chiffre d'affaires a grimpé de 30% l'an dernier",
  "Total a annoncé une acquisition de 12 milliards d'euros",
  "Selon le rapport annuel, la marge EBITDA est de 18%",
  "La nouvelle directive européenne 2024/65 s'applique au 1er janvier",
  "Sanofi a fusionné avec Genzyme en 2011",
  "Le PDG actuel est Jean Dupont",
];

// MUST NOT match — banal phrasing or non-claim
const MUST_NOT_MATCH = [
  "c'est une bonne idée",
  "il est important de comprendre",
  "le sujet est intéressant",
  "selon moi on devrait reporter",
  "je pense que c'est premier",
  "elle est la personne qui m'a parlé",
];

for (const text of MUST_MATCH) {
  assert.ok(preFilterClaim(text), `should match: "${text}"`);
}
console.log(`✓ ${MUST_MATCH.length} positive cases match`);

for (const text of MUST_NOT_MATCH) {
  assert.equal(preFilterClaim(text), false, `should NOT match: "${text}"`);
}
console.log(`✓ ${MUST_NOT_MATCH.length} negative cases correctly rejected`);

console.log("\nAll claim-detector regex tests passed.");
```

- [ ] **Step 3.2: Run the test to verify some cases fail**

Run: `npx tsx src/lib/live/utils/__tests__/claim-detector-regex.test.ts`
Expected: failures on the negative cases (`"c'est une bonne idée"`, `"selon moi"`, etc.) because the current regex matches `\b(c'est|est le|est la|est un|est une)\b`, `\b(selon|d'après)\b`, `\b(premier|deuxième)\b` too broadly. Note: `preFilterClaim` is currently not exported — see step 3.3 for how to expose it.

- [ ] **Step 3.3: Export `preFilterClaim` and tighten the regex array**

In `src/lib/live/pipelines/claim-detector.ts`, change the patterns array and add `export` to `preFilterClaim`.

Edit `src/lib/live/pipelines/claim-detector.ts:16-37`, replace the entire `CLAIM_PATTERNS` array with:

```ts
// Pre-filter patterns that suggest a verifiable claim.
// Each pattern targets a concrete, fact-checkable signal (numbers, named
// entities, declared actions). Generic copulas like "c'est" / "est le" are
// intentionally NOT included — they match anything and produce noise.
const CLAIM_PATTERNS = [
  // Numeric & financial signals
  /\d+[\s,.]?\d*\s*(%|pourcent|pour cent|percent)/i,
  /\d+[\s,.]?\d*\s*(milliard|million|billion|trillion|mille)/i,
  /\d+[\s,.]?\d*\s*(€|euro|euros|dollar|dollars|\$|£)/i,
  /\b(chiffre d'affaires|ebitda|marge brute|marge nette|résultat net|résultat opérationnel)\b/i,
  /\b(en \d{4}|depuis \d{4}|au \d+(er|e|ème) trimestre)\b/i,
  /\b(taux|ratio|indice|index)\s+(de|d')/i,
  // Material transactions & named entities
  /\b(acquisition|rachat|fusion|levée de fonds|introduction en bourse|ipo|cession|spin-off)\b/i,
  /\b(a annoncé|a déclaré|a confirmé|a racheté|a démenti|a affirmé|a publié|a signé)\b/i,
  /\b(appartient à|est détenu par|est détenue par|est filiale de|a fusionné avec)\b/i,
  // Legal / regulatory
  /\b(loi|article|décret|réglementation|norme|directive|règlement)\s+(n°|num|européen|du|de)/i,
  // Leadership: only when paired with a named role title or a concrete action
  /\b(PDG|CEO|DG|président|présidente|directeur général|directrice générale|fondateur|fondatrice|COO|CFO|CTO)\b/i,
  /\b(a fondé|a créé|a lancé|a quitté|a rejoint|a été nommé|a été nommée|a démissionné)\b/i,
];
```

Then update line 44 (function signature):

```ts
export function preFilterClaim(text: string): boolean {
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `npx tsx src/lib/live/utils/__tests__/claim-detector-regex.test.ts`
Expected: both lines `✓ N positive cases match` and `✓ N negative cases correctly rejected`, then `All claim-detector regex tests passed.`. Exit code 0.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/live/pipelines/claim-detector.ts src/lib/live/utils/__tests__/claim-detector-regex.test.ts
git commit -m "refactor(live): tighten claim-detector pre-filter regex"
```

---

## Task 4: Gate fact-checker with filter + dedup

**Files:**
- Modify: `src/lib/live/pipelines/fact-checker.ts`

Read the current file first to locate the `verifyClaim` function and the orchestrator call sites. The integration point is wherever `fact-checker.ts` decides what to return after `verifyClaim`. We add the filter call there, gate on `decision.publish`, dedup, and record on publish.

- [ ] **Step 4.1: Locate the integration point**

Run: `grep -n "export\|verifyClaim\|writeFact" src/lib/live/pipelines/fact-checker.ts`
Expected: identify the top-level exported function (likely `checkClaims` or `runFactCheck`) that returns `FactCheckResult[]`. The filter call goes after `verifyClaim` succeeds, before the result is pushed into the return array.

- [ ] **Step 4.2: Add filter + dedup integration**

Add these imports at the top of `src/lib/live/pipelines/fact-checker.ts`:

```ts
import { evaluateImportance } from "../utils/importance-filter";
import { isDuplicate, recordPublication } from "../utils/semantic-dedup";
```

Update the function signature of the top-level exported function (replace `checkClaims` / `runFactCheck` with the actual name found in 4.1) to accept the same context the filter needs:

```ts
export async function runFactCheck(
  claims: DetectedClaim[],
  meetingId: string,
  recentTranscript: string,
  agendaText: string,
  boardSector?: string,
): Promise<FactCheckResult[]> {
  // existing body, but after a successful verifyClaim() call producing `result`:
  //   const decision = await evaluateImportance({
  //     pipeline: "factcheck",
  //     meetingId,
  //     recentTranscript,
  //     boardSector,
  //     agendaText,
  //     candidate: claim.claim,
  //   });
  //   if (!decision.publish) continue;
  //   if (isDuplicate(meetingId, "factcheck", { tokens: claim.claim })) {
  //     liveLogger.info("alert_dropped", {
  //       pipeline: "factcheck", meeting_id: meetingId, reason: "semantic_dedup",
  //       candidate_summary: claim.claim.slice(0, 80),
  //     });
  //     continue;
  //   }
  //   recordPublication(meetingId, "factcheck", { tokens: claim.claim });
  //   results.push(result);
}
```

The exact patch depends on the existing loop structure. Read it, then thread `meetingId`, `recentTranscript`, `agendaText`, `boardSector` into the function and apply the filter+dedup pattern from the comment above to each verified claim before adding it to `results`.

- [ ] **Step 4.3: Update the orchestrator call site**

Run: `grep -n "factcheck\|checkClaims\|runFactCheck" src/lib/live/orchestrator.ts`
Identify the call to the fact-checker pipeline. Replace it with the new signature, passing `session.meetingId`, the last 1500 chars of accumulated transcript, `session.meetingAgenda`, and `session.boardSector`.

- [ ] **Step 4.4: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors. If any, they are most likely missing argument in the orchestrator call — adjust the call site.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/live/pipelines/fact-checker.ts src/lib/live/orchestrator.ts
git commit -m "feat(live): gate fact-check alerts with importance filter and dedup"
```

---

## Task 5: Refactor moderator to pattern-driven + gate

**Files:**
- Modify: `src/lib/live/pipelines/moderator.ts` (essentially a rewrite of the export `moderate` flow)

The current moderator alerts on isolated events (single interruption ≥0.3s, instantaneous ratio >70%). We replace this with three motif detectors that work over rolling windows, then gate with filter + dedup.

- [ ] **Step 5.1: Add motif detectors and replace event-driven flow**

Edit `src/lib/live/pipelines/moderator.ts`. Replace the entire body of the file with:

```ts
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
}

const states = new Map<string, ModeratorState>();
function getState(meetingId: string): ModeratorState {
  let s = states.get(meetingId);
  if (!s) {
    s = { interruptions: [], lastSpeakingByUser: new Map() };
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
  for (let i = 1; i < newSegments.length; i++) {
    const prev = newSegments[i - 1];
    const curr = newSegments[i];
    if (
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
  for (const c of counts.values()) {
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
  const stats = tracker.getStatsInWindow ? tracker.getStatsInWindow(MONOPOLISATION_WINDOW_MS) : tracker.getStats();
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
        type: "off_topic",
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
```

- [ ] **Step 5.2: Update SpeakerTracker if `getStatsInWindow` doesn't exist**

Run: `grep -n "getStatsInWindow\|getStats" src/lib/live/utils/speaker-tracker.ts`
Expected: confirm whether a windowed variant exists. If `getStatsInWindow` is missing, add it to `speaker-tracker.ts`. The exact addition depends on the existing internal data — typically, the tracker already stores per-speaker durations; we just need a method that filters to the last N ms. If the existing tracker doesn't store timestamped entries, add a parallel `addSpeakingAt(speaker, durationS, atMs)` and a `getStatsInWindow(windowMs)` that sums durations from entries with `atMs >= now - windowMs`. If unsure, fall back to `getStats()` in `detectMonopolisation` and add a TODO comment noting the window is over the whole session (acceptable for v1).

- [ ] **Step 5.3: Update the orchestrator call to `moderate`**

In `src/lib/live/orchestrator.ts`, find the call to `moderate(...)` and pass the new arguments:

```ts
const alerts = await moderate(
  newSegments,
  session.segments,            // all segments
  session.speakerTracker,
  session.meetingAgenda,
  session.meetingId,
  /* participantIds */ Array.from(session.lastSpeakingByUser?.keys() ?? []), // see note below
  /* recentTranscript */ session.segments.slice(-15).map(s => s.content).join(" "),
  session.boardSector,
);
```

Note: if no participant list is available on the session, pass `[]` for `participantIds` — silence detection will simply skip. Adding a real participant list is a follow-up if needed.

- [ ] **Step 5.4: Wire stop cleanup**

In `src/lib/live/orchestrator.ts`, find the session stop / cleanup path (likely `stopSession` near the end of the file). Add:

```ts
import { resetSessionBuffer } from "./utils/semantic-dedup";
import { resetModeratorState } from "./pipelines/moderator";
// ... in stopSession before returning:
resetSessionBuffer(meetingId);
resetModeratorState(meetingId);
```

- [ ] **Step 5.5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any remaining call-site mismatches.

- [ ] **Step 5.6: Commit**

```bash
git add src/lib/live/pipelines/moderator.ts src/lib/live/utils/speaker-tracker.ts src/lib/live/orchestrator.ts
git commit -m "refactor(live): moderator is pattern-driven, gated by importance filter"
```

---

## Task 6: Refactor suggester to reason-driven + gate

**Files:**
- Modify: `src/lib/live/pipelines/suggester.ts`

The current suggester runs every 45s if it has ≥6 segments. We replace this with a detector that prompts Haiku for a structured reason (matching one of the 4 allowed criteria) and then passes the candidate through the importance filter and dedup.

- [ ] **Step 6.1: Replace the suggester body**

Edit `src/lib/live/pipelines/suggester.ts`. Replace the entire file content with:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Suggestion, TranscriptionSegment, DetectedClaim } from "../schemas";
import { liveLogger } from "../utils/logger";
import { parseLlmJson } from "../utils/parse-llm-json";
import { evaluateImportance, SUGGESTION_CRITERIA } from "../utils/importance-filter";
import { isDuplicate, recordPublication } from "../utils/semantic-dedup";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MIN_SEGMENTS = 6;
const MAX_SUGGESTIONS_PER_RUN = 2;

interface DetectorContext {
  recentSegments: TranscriptionSegment[];
  recentClaims: DetectedClaim[];
  meetingId: string;
  boardName?: string;
  boardSector?: string;
  boardStrategicContext?: string;
  agendaText: string;
}

interface RawCandidate {
  reason: (typeof SUGGESTION_CRITERIA)[number];
  type: Suggestion["type"];
  content: string;
  priority: "high" | "medium";
  context: string;
}

async function proposeCandidates(ctx: DetectorContext): Promise<RawCandidate[]> {
  const text = ctx.recentSegments
    .slice(-15)
    .map((s) => `${s.speaker ? `[${s.speaker}] ` : ""}${s.content}`)
    .join("\n");
  const claimsContext = ctx.recentClaims.length > 0
    ? `\n\nAffirmations récentes:\n${ctx.recentClaims.map((c) => `- ${c.claim}`).join("\n")}`
    : "";
  const boardContext = [
    ctx.boardName ? `Entreprise : ${ctx.boardName}` : null,
    ctx.boardSector ? `Secteur : ${ctx.boardSector}` : null,
    ctx.boardStrategicContext ? `Contexte stratégique : ${ctx.boardStrategicContext}` : null,
  ].filter(Boolean).join("\n");
  const agendaSection = ctx.agendaText.trim().length > 0
    ? `\n\nOrdre du jour :\n${ctx.agendaText.trim()}`
    : "";

  const prompt = `Tu génères des suggestions pour un conseil d'administration UNIQUEMENT si tu identifies une raison concrète.

Raisons autorisées (renvoie EXACTEMENT un de ces strings dans "reason") :
- trou_agenda : un sujet de l'ordre du jour n'a pas été abordé et la réunion avance
- decision_sans_suite : la discussion conclut "on fera X" sans owner ni deadline
- info_docs_ignoree : un chiffre/fait des documents serait pertinent mais n'a pas été mentionné
- enjeu_structurel_manque : un sujet est traité tactiquement alors qu'un enjeu stratégique adjacent n'est pas posé

Règle d'or : silence par défaut. Public senior, pas de bruit. Si aucune raison ne s'applique précisément à ce qui vient d'être dit, retourne {"candidates": []}.

${boardContext ? `Contexte :\n${boardContext}` : ""}${agendaSection}

Discussion récente :
"""
${text}
"""${claimsContext}

Retourne UNIQUEMENT un JSON valide :
{
  "candidates": [
    {
      "reason": "trou_agenda" | "decision_sans_suite" | "info_docs_ignoree" | "enjeu_structurel_manque",
      "type": "deep_dive" | "question" | "action_item" | "reference",
      "content": "La suggestion concrète, en une phrase",
      "priority": "high" | "medium",
      "context": "Pourquoi cette raison s'applique ici"
    }
  ]
}

Maximum 3 candidats, mais zéro est la réponse normale si rien de précis ne se présente.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = parseLlmJson(content) as { candidates?: Array<Record<string, unknown>> };
    const allowed = new Set<string>(SUGGESTION_CRITERIA);
    return (parsed.candidates ?? [])
      .filter((c) => typeof c.reason === "string" && allowed.has(c.reason as string))
      .map((c) => ({
        reason: c.reason as RawCandidate["reason"],
        type: (c.type ?? "question") as Suggestion["type"],
        content: String(c.content ?? "").trim(),
        priority: (c.priority === "high" ? "high" : "medium") as RawCandidate["priority"],
        context: String(c.context ?? "").trim(),
      }))
      .filter((c) => c.content.length > 0);
  } catch (error) {
    liveLogger.error("suggester_detector_error", { error: String(error) });
    return [];
  }
}

export async function generateSuggestions(
  recentSegments: TranscriptionSegment[],
  recentClaims: DetectedClaim[],
  meetingId: string,
  agendaText: string,
  boardName?: string,
  boardSector?: string,
  boardStrategicContext?: string
): Promise<Suggestion[]> {
  if (recentSegments.length < MIN_SEGMENTS) return [];
  const startTime = Date.now();

  const candidates = await proposeCandidates({
    recentSegments,
    recentClaims,
    meetingId,
    boardName,
    boardSector,
    boardStrategicContext,
    agendaText,
  });

  const published: Suggestion[] = [];
  for (const cand of candidates) {
    if (published.length >= MAX_SUGGESTIONS_PER_RUN) break;

    if (isDuplicate(meetingId, "suggestion", { tokens: cand.content })) {
      liveLogger.info("alert_dropped", {
        pipeline: "suggestion",
        meeting_id: meetingId,
        reason: "semantic_dedup",
        candidate_summary: cand.content.slice(0, 80),
      });
      continue;
    }

    const decision = await evaluateImportance({
      pipeline: "suggestion",
      meetingId,
      recentTranscript: recentSegments.slice(-15).map((s) => s.content).join(" "),
      boardSector,
      agendaText,
      candidate: `${cand.reason} — ${cand.content}`,
      detectedCriterionHint: cand.reason,
    });
    if (!decision.publish) continue;

    recordPublication(meetingId, "suggestion", { tokens: cand.content });
    published.push({
      type: cand.type,
      content: cand.content,
      priority: cand.priority,
      context: cand.context || null,
    });
  }

  if (published.length > 0) {
    liveLogger.info("suggestions_published", {
      meeting_id: meetingId,
      count: published.length,
      latency_ms: Date.now() - startTime,
    });
  }

  return published;
}

export function resetSuggestionState(_meetingId?: string): void {
  // No module-level state anymore; dedup is owned by semantic-dedup, which is
  // reset via resetSessionBuffer in the orchestrator stop path.
}
```

- [ ] **Step 6.2: Update the orchestrator call to `generateSuggestions`**

In `src/lib/live/orchestrator.ts`, replace the call to `generateSuggestions(...)`. The new signature drops `force` and adds `meetingId` + `agendaText`:

```ts
const suggestions = await generateSuggestions(
  session.segments,
  session.recentClaims,
  session.meetingId,
  session.meetingAgenda,
  session.boardName,
  session.boardSector,
  session.boardStrategicContext,
);
```

If there's a temporal "tick" check around the call (something like `if (Date.now() - lastSuggestionTime > 45_000)`), remove it — the new design uses no temporal cooldown. The natural pacing comes from the orchestrator's existing pipeline tick rate; if the orchestrator runs suggestions on every transcript flush, that is acceptable because the detector returns `[]` when nothing is justified.

- [ ] **Step 6.3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6.4: Commit**

```bash
git add src/lib/live/pipelines/suggester.ts src/lib/live/orchestrator.ts
git commit -m "refactor(live): suggester is reason-driven, gated by importance filter"
```

---

## Task 7: End-to-end smoke verification

**Files:** none modified (verification only)

- [ ] **Step 7.1: Restart the dev server**

Run:
```bash
lsof -ti:3002 | xargs -r kill
NODE_OPTIONS='--max-old-space-size=8192' npx next dev -p 3002 > /tmp/board-advisor-dev.log 2>&1 &
until curl -sS -o /dev/null --max-time 2 http://localhost:3002/; do sleep 2; done
echo "READY"
```

- [ ] **Step 7.2: Start a live session and observe logs**

In a separate terminal:
```bash
tail -f /tmp/board-advisor-dev.log | grep -E "alert_dropped|alert_published|moderation_published|suggestions_published|importance_filter_error"
```

Open the app, launch a meeting in `in_person` mode, and speak (or play a recorded sample) for ~10 minutes covering:
- a clear factual claim with a number (e.g. "le chiffre d'affaires a grimpé de 30%")
- a banal copula sentence (e.g. "c'est vrai")
- a fake interruption pattern (overlap on purpose 3 times within 5 min between two participants)
- a long monologue (>75% of speaking time for one speaker)

Then check the log stream:
- the factual claim → expect `alert_published pipeline=factcheck criterion=chiffre_materiel`
- the copula → expect either no entry (filtered at regex) or `alert_dropped pipeline=factcheck reason=out_of_criteria`
- the repeated interruptions → expect `alert_published pipeline=moderation criterion=interruption_repetee` once, then no spam (subsequent attempts → `alert_dropped reason=semantic_dedup`)
- random small talk → no `alert_published` for suggestion

- [ ] **Step 7.3: Verify UI didn't change**

Open the live meeting page in the browser. Confirm:
- fact-checks, moderation alerts, and suggestions still display as before (same components, same fields)
- no new "reason" label / tooltip / icon is shown (this is the spec requirement: the filter is internal)

- [ ] **Step 7.4: Calibration note**

Skim the last 100 log lines for the ratio of `alert_dropped reason=score_below_threshold` vs `alert_published`. If almost everything is dropped at score 6, drop `PUBLISH_THRESHOLD` to 6 in `src/lib/live/utils/importance-filter.ts` and rerun the test. If almost everything passes and the UX still feels noisy, raise to 8. Record observations in the commit message of any tuning commit.

- [ ] **Step 7.5: Final commit (only if anything was tuned during 7.4)**

```bash
git add src/lib/live/utils/importance-filter.ts
git commit -m "chore(live): tune PUBLISH_THRESHOLD after smoke test"
```

---

## Self-Review

**Spec coverage:**
- Filter LLM with score 1–10 + criterion → Task 2 (`importance-filter.ts`)
- Threshold ≥7, fail-closed → Task 2 (`PUBLISH_THRESHOLD`, `llm_error` branch)
- Per-pipeline criterion whitelists → Task 2 (constants), Task 4/5/6 (used at call sites)
- Tighten claim-detector regex → Task 3
- Refactor moderator to motif-based → Task 5
- Refactor suggester to reason-based → Task 6
- Semantic dedup 10-min buffer → Task 1
- Structured logs `alert_dropped` / `alert_published` → Task 2, reused in Tasks 4/5/6
- UI and schema unchanged → Task 7.3 verifies
- No quota / no temporal cooldown → suggester no longer has `SUGGESTION_COOLDOWN_MS`; moderator no longer has `MODERATION_COOLDOWN_MS`
- Session cleanup → Task 5.4 (`resetSessionBuffer`, `resetModeratorState`)

**Placeholder scan:** no TBD/TODO except the explicit fallback note in Step 5.2 (acceptable: it's a contingency for a missing windowed API on the speaker tracker).

**Type consistency:** `evaluateImportance`, `isDuplicate`, `recordPublication`, `resetSessionBuffer` signatures match across all call sites. `PipelineKind` and `Pipeline` are aligned (both use the same three string literals).

**Risks called out in spec:** sur-strict at start (mitigated by Task 7.4 calibration), added latency (acceptable per spec), false negatives on motifs (acceptable per spec).
