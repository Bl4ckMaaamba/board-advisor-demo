# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Board Advisor is an AI-powered corporate governance platform for board administrators. It helps prepare meetings, manage documents, provides an agentic chatbot with RAG over uploaded documents + external data sources, runs five live pipelines during meetings (fact-check, moderation, suggestion, expert panel, blind spots) in-person or visio, and auto-generates a markdown "compte rendu" report after each meeting. UI is in French.

Per-feature specifications (cahiers des charges) live in `specs/features/*.md` — read the relevant CDC before touching a feature.

## Commands

```bash
npm run dev      # Next.js dev server with 8GB heap (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint (next lint)
npm run start    # Production server
```

No test framework is configured.

## Environment Variables (.env.local)

Core:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
- `NEXT_PUBLIC_APP_URL` — public app URL (used as webhook base URL for Recall.ai)
- `DATABASE_URL` — Postgres direct connection (server-side scripts)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side admin operations
- `ANTHROPIC_API_KEY` — Claude (agent, expert panel, RAG reranking, classifier)
- `PERPLEXITY_API_KEY` — **OpenRouter** key despite the name (used to hit `https://openrouter.ai/api/v1/chat/completions` with `perplexity/sonar-deep-research` for `/api/agent-search` and `/api/agent-unified`)
- `VOYAGE_API_KEY` — Voyage embeddings (`voyage-4`, 1024 dims)
- `OPENAI_API_KEY` — legacy / optional

Live meetings:
- `DEEPGRAM_API_KEY` — direct Deepgram streaming for in-person meetings
- `RECALL_API_KEY` — Recall.ai managed bot (joins Zoom/Meet/Teams, forwards audio to Deepgram nova-2 internally)
- `RECALL_API_BASE` — optional, defaults to `https://eu-central-1.recall.ai/api/v1`

Data broker (Layer 3 providers — each optional, system degrades gracefully):
- `BRAVE_API_KEY`, `TAVILY_API_KEY` — web search
- `FMP_API_KEY` — Financial Modeling Prep
- `PAPPERS_API_KEY` — French company registry
- `NEWSAPI_API_KEY` — news
- `PISTE_CLIENT_ID`, `PISTE_CLIENT_SECRET` — Legifrance (French legal)
- `FRED_API_KEY` — Federal Reserve macro data

Cache / email:
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — L2 cache for data broker
- `RESEND_API_KEY` — invitations via Edge Functions (requires a verified custom domain)

## Tech Stack

- **Framework**: Next.js 14 (App Router, React 18, TypeScript)
- **Styling**: Tailwind CSS + Radix UI + Framer Motion + shadcn/ui
- **Fonts**: Playfair Display (`--font-playfair`) + DM Sans (`--font-dm-sans`) in `src/app/layout.tsx`
- **Database**: Supabase (PostgreSQL + pgvector + Realtime)
- **LLMs**:
  - `claude-sonnet-4-6` — main agent, expert panel insights, simple chat, agent-canvas
  - `claude-opus-4-6` — deep reasoning (`/api/agent-thinking`, extended thinking)
  - `claude-haiku-4-5-20251001` — RAG reranking, data broker intent classifier, conversation titles
  - `perplexity/sonar-deep-research` via OpenRouter — web deep search (`/api/agent-search`, `/api/agent-unified`)
- **Embeddings**: Voyage 4 (`voyage-4`, 1024 dims)
- **Document parsing**: `pdf-parse`, `mammoth` (DOCX), `xlsx`
- **Slide generation**: `pptxgenjs` (agent-canvas)
- **External data**: 10-provider data broker (see below)
- **Live audio**: Deepgram streaming directly (in-person) or via Recall.ai (visio)
- **Email**: Resend via Supabase Edge Functions (Deno)

`next.config.mjs` marks `pdf-parse`, `ws`, `bufferutil`, `utf-8-validate` as `serverComponentsExternalPackages` — needed for SSR.

## Authentication

- Google OAuth + email/password via Supabase Auth; password reset via `resetPasswordForEmail()`
- `/auth/callback/route.ts` — exchanges OAuth code for session
- `src/middleware.ts` — guards `/dashboard/*` and `/invite/*`, redirects to `/login` with `next` param
- Profile auto-created by DB trigger `handle_new_user()` on `auth.users` INSERT
- `src/lib/supabase.ts` (client) / `src/lib/supabase-server.ts` (server, with `getAuthenticatedUser()`)
- Email verification / invitations require a Resend-verified custom domain — **not configured by default**

## Architecture

### Routing (App Router)

- `/` — landing
- `/login`, `/reset-password`, `/auth/callback` — auth flows
- `/dashboard` — wrapped in `BoardProvider` context
- `/dashboard/boards`, `/boards/[id]`, `/boards/new` — board management
- `/dashboard/meetings` — unified single page with 3 inline views (list → detail → live)
- `/dashboard/meetings/live/[meetingId]/mic` — mobile lobby/launch for multi-mic participants (in-person)
- `/dashboard/documents` — upload + list (with preview/delete)
- `/dashboard/reports`, `/dashboard/reports/[id]` — list + view auto-generated meeting reports
- `/dashboard/actions` — cross-board action item tracker (status / priority / owner)
- `/dashboard/chat` — agentic chatbot (streamed, navigation-resilient)
- `/dashboard/account` — profile + logout
- `/invite/board/[token]` — invitation acceptance

### Multi-Member Board System

Tables: `profiles`, `boards`, `board_members`, `board_invitations`, `meeting_participants`. Roles: owner / admin / member. Token-based email invitations via Resend.

- **RLS is board-member-scoped** everywhere, with a NULL-safe fallback for standalone meetings (see migration 014): `(board_id IS NULL AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM board_members WHERE ...)`.
- View `my_boards` joins boards + board_members for the current user — frontend reads from this view.
- RPCs: `accept_board_invitation()`, `remove_board_member()`, `transfer_meeting_admin()`.
- Triggers auto-create a profile on signup, auto-add owner on board creation, auto-populate meeting participants.
- Types in `src/lib/types/boards.ts`, server helpers in `src/lib/api/boards.ts`, client context in `src/lib/board-context.tsx` (exposes `useBoardContext()` + `matchesBoard()`). **Board IDs are UUIDs.**

### RAG Pipeline (`src/lib/rag.ts`)

1. **Upload** (`POST /api/rag/process`): file → `extractText()` (PDF/DOCX/XLSX/TXT/MD via `src/lib/extract-text.ts`) → `chunkText()` (**4000 chars / 500 overlap**, French-aware section detection: Markdown headers, `Article N`, `Résolution`, `Chapitre`, `Titre`, `Annexe`, roman numerals, CAPS titles) → Voyage 4 embeddings → `document_chunks` with `vector(1024)`.
2. **Search** (`POST /api/rag/search`): query → embedding → `match_documents` RPC (pgvector cosine, threshold 0.5, board-member-scoped) → Claude Haiku reranking.
3. **Chat**: `/api/agent` (agent with tools) — see Agent System below.

### Agent System (`src/lib/agent/`)

Two-phase orchestration (`src/lib/agent/index.ts`, `MAX_FOLLOW_UPS = 1`, model `claude-sonnet-4-6`):

1. **Phase 1 — Planning**: Sonnet picks all tools to run in parallel (one message, multiple tool_use blocks). Tools executed concurrently via `Promise.all`.
2. **Phase 2 — Synthesis**: tool results fed back. Up to 1 follow-up tool call allowed. On the last round, `thinking: { type: "enabled", budget_tokens: 10000 }` is set — **no tools permitted in the thinking round** (Anthropic API constraint).
3. **Streaming** (`runAgentStreaming`) yields `tools` → `text` → `sources` → `done` events.

Tools (`src/lib/agent/tools/`, registered in `registry.ts`, defined in `definitions.ts`): `search_internal_documents` (RAG), `get_company_info` (Pappers/OpenCorporates), `get_financial_data` (FMP), `search_news` (NewsAPI/Google News RSS/web), `check_legal` (Legifrance → Brave fallback), `get_macro_indicators` (FRED/World Bank), `sector_benchmark` (FMP + web).

Source extraction: `[Source: X]` and `[PROVIDER] (NN%)` patterns parsed from tool results into `SourceRef[]` with confidence scores.

### Specialized Agent Endpoints

Four additional routes for different modes:

| Route | Model | Purpose |
|---|---|---|
| `/api/agent` | Sonnet 4.6 | Main agentic chat with tools (streaming) |
| `/api/agent-canvas` | Sonnet 4.6 | Slide (PPTX) generation via `pptxgenjs` with full document chunks |
| `/api/agent-search` | Perplexity Sonar Deep Research (OpenRouter) | Web deep search + reasoning |
| `/api/agent-thinking` | Opus 4.6 + `thinking` (16k budget) | Deep reasoning mode; `src/lib/agent/thinking-prompt.ts` enforces 5 filters (legal / financial / strategic / operational / ESG) at CAC 40 / FTSE 100 standard |
| `/api/agent-unified` | Sonnet + Opus + Perplexity | Orchestrator — combines tools + deep search + Opus reasoning |
| `/api/chat` | Sonnet 4.6 | Simple chat (no tools, no orchestration) |

### Chat Store (`src/lib/chat-store.ts`)

Module-level state store for the chatbot, not React-hook-based. This is deliberate: navigating away from `/dashboard/chat` during a streaming response would otherwise unmount the component and lose the response.

- `chatStore` persists at module scope; listeners notify mounted components
- `_stopRequested` flag lets the stop button interrupt the SSE parser cleanly
- `_parseSSE()` is an async generator that reads the response stream
- `response-stream.tsx` renders markdown live via ReactMarkdown + remark-gfm with an animated cursor while streaming

### Data Broker (`src/lib/data-broker/`)

5-layer orchestrator for external data. Full spec in `docs/DATA_BROKER.md`.

- **Layer 1 — Ingress**: LLM classifier (Haiku) detects intent (`benchmark` / `fact_check` / `news` / `legal` / `macro` / `esg`), extracts entities, injects board context, builds query plans.
- **Layer 2 — Orchestration**: circuit breaker per provider, cost controller, parallel execution engine.
- **Layer 3 — Providers** (10): Brave, Tavily, FMP, Pappers, Legifrance PISTE, FRED, NewsAPI, World Bank, OpenCorporates, Google News RSS — with declared fallback chains.
- **Layer 4 — Normalize & Cache**: 3-level (L1 in-memory → L2 Upstash Redis → L3 Supabase), normalizes to `DataPacket` (`schemas/`).
- **Layer 5 — Egress**: dedup, inter-provider conflict detection, merge, delivery.

Entry points: `POST /api/data-broker` (query) and `GET /api/data-broker/health`. Missing provider keys don't crash — the circuit breaker marks them unavailable.

### Live Meeting System (`src/lib/live/`)

Real-time transcription + 5 pipelines running concurrently during a meeting: **fact-check**, **moderation**, **suggestion**, **expert panel**, **blind spots**. Two capture modes:

**In-person (`meeting_type = 'in_person'`)**: microphone → direct Deepgram streaming WebSocket (`src/lib/live/transcription/deepgram-client.ts`). Supports **multi-mic**: each participant joins from their own device via `/dashboard/meetings/live/[meetingId]/mic` (mobile-friendly lobby/launch page); the orchestrator stamps every transcription with the real `speaker_user_id` (migration 015) instead of a free-text label, so per-speaker stats and expert pipelines resolve real identities.

**Visio (`meeting_type = 'visio'`)**: Recall.ai managed bot joins Zoom/Meet/Teams as a participant → internally uses Deepgram streaming (nova-2, multilingual — configured in `src/lib/live/recall/recall-client.ts`) → webhooks POST to `/api/live/webhook` → adapter normalizes into the same pipeline as in-person.

Key modules:
- `orchestrator.ts` — session state machine. The session store carries `expertProfile`, `boardName`, `boardSector`, `boardStrategicContext`, `runningSummary`, `meetingAgenda` (raw text fetched from the uploaded agenda document at session start), `expertAutoEnabled`, and blind-spots tick state (`blindSpotsAutoEnabled`, `lastBlindSpotsRunAt`, `lastBlindSpotsExternalAt`). Runs `runExpertPipeline()` and `runBlindSpotsPipeline()` alongside fact-check/moderation/suggestion. `startSession()` accepts an optional `existingMeetingId` so the in-person flow reuses the meeting created via `/dashboard/meetings` (with its agenda + docs) instead of creating a fresh one.
- `utils/fetch-agenda-text.ts` — pulls the document with `category='agenda'` for the meeting, extracts its text via the RAG pipeline, returns it as a single string for the moderator + report generator. Returns `""` on miss (no agenda uploaded).
- `audio/` — raw audio streaming (in-person)
- `transcription/deepgram-client.ts` — direct Deepgram WebSocket (in-person)
- `transcription/speaker-turn-buffer.ts` — **visio only**: accumulates Recall webhook chunks per speaker and emits a completed turn on speaker change or 15 s silence. Pipelines (fact-check/moderation/suggestion/expert/blind-spots) run on whole turns, not per chunk, so the LLM gets enough context and partial-claim noise is cut. Persistence to `meeting_transcriptions` still happens immediately so the UI updates live. Flushed on `stopSession()` so any in-flight turn is processed before shutdown.
- `recall/` — `recall-client.ts` (bot lifecycle), `recall-transcript-adapter.ts` (normalize to internal format), `webhook-router.ts` (dispatch Recall events)
- `pipelines/` — `fact-checker.ts`, `moderator.ts`, `suggester.ts`, `claim-detector.ts`, `expert-pipeline.ts`, `blind-spots.ts`. All pipelines parse LLM output via `utils/parse-llm-json.ts` (tolerant of ```json fences that Claude sometimes adds despite instructions).
- `expert/` — see Expert Panel below
- `blind-spots/` — see Blind Spots Pipeline below
- `delivery/` — Supabase Realtime / client delivery adapters
- `schemas.ts` — Zod schemas for all events
- `utils/` — `parse-llm-json.ts` (fence-tolerant JSON parser), `logger.ts`, `latency-monitor.ts`, `speaker-tracker.ts`

Results persisted in `meeting_transcriptions`, `meeting_factchecks`, `meeting_moderations`, `meeting_suggestions`, `meeting_expert_insights`, `meeting_blind_spots`, `meeting_decisions_pending`.

### Expert Panel (`src/lib/live/expert/`)

Panel of 10 AI personas (Bernard Arnault, Warren Buffett, Satya Nadella, Christine Lagarde, Elon Musk, Jensen Huang, Patrick Pouyanné, Albert Bourla, Jamie Dimon, Indra Nooyi) who comment on the live discussion in character.

- **Model**: `claude-sonnet-4-6` via Anthropic SDK.
- **Prompts**: `expert-prompts.ts` defines each expert's cognitive framework + intervention patterns (~550 lines).
- **Auto-selection**: `expert-selector.ts` matches board sector/aliases to a primary expert on meeting start. **Role-based panel**: when the board has a sector, the panel is dynamically composed (primary sector expert + complementary roles) rather than a fixed 10-persona list.
- **Trigger**: manual by default (`expertAutoEnabled = false` on session start, `is_manual` flag on the insight). Auto-mode can be flipped via `/api/meetings/[id]/expert-panel/config` and runs over running summary + recent transcription.
- **Dedup**: `expert-dedup.ts` + `expert-relevance.ts` prevent redundant or off-topic takes.
- **DB** (migration 013): `meeting_expert_insights` (take, analysis, tags, is_manual), `meeting_expert_config` (primary + additional experts per meeting). Realtime enabled.
- **UI**: `src/app/dashboard/meetings/live/components/ExpertPanel.tsx` — shows the "take" (punchy quote), tags, collapsible analysis, colored per expert. Streamed via `useRealtimeExpertInsights` hook.

### Blind Spots Pipeline (`src/lib/live/blind-spots/`)

5th live pipeline (CDC: `specs/features/blind-spots.md`). Detects what is **not** said during the meeting but should be — surfaced from 3 source types:

- **Type A — `docs`**: relevant document chunks (via RAG `match_documents`) that aren't being discussed.
- **Type B — `memory`**: prior decisions / open action items / engagement commitments from `board_decisions`, `board_actions`, `board_engagement_commitments` not being followed up on.
- **Type C — `external`**: external signals from the Data Broker (news, regulatory, macro) the board should know about.

Implementation:
- **Detectors**: `blind-spots/detectors/*.ts` — one per source type; each returns candidate blind spots with `source_type` (`document` / `meeting_history` / `decision` / `web` / `api`) and a polymorphic `source_reference` JSONB.
- **Dedup & quotas** (`blind-spots-dedup.ts`): max 5 emissions / hour, ≥ 5 min between two (except `critical`), max 2 per `domain` (finance / strategie / juridique / operations / rh / esg / tech), Jaccard similarity ≥ 0.6 marks a duplicate.
- **Auto-tick**: orchestrator ticks the pipeline on a base interval (`BLIND_SPOTS_TICK_MS`) and a longer external-only interval (`BLIND_SPOTS_EXTERNAL_INTERVAL_MS`) — Data Broker calls are expensive, so external signals refresh less often than docs/memory.
- **Default = manual**: `blindSpotsAutoEnabled` starts at `false`. The pipeline runs on UI request only (modal `BlindSpotRequestModal.tsx`). Auto-detection can be re-enabled via `setBlindSpotsAutoEnabled()` / `/api/meetings/[id]/blind-spots/config`. Same convention now applies to the Expert Panel (`expertAutoEnabled: false` by default).
- **DB** (migration 017): `meeting_blind_spots` (title, description, recommended_action, type, severity, domain, source_type, source_reference, is_manual, trigger_query, relevance_score). Realtime enabled.
- **API**: `/api/meetings/[id]/blind-spots` (list + manual trigger), `/api/meetings/[id]/blind-spots/config` (toggle auto).

### Reports / Compte rendu (`src/lib/reports/`)

Auto-generated markdown meeting report after each live session.

- `generate-report.ts` — runs with the **service-role** client (cross-RLS read, callable from background contexts e.g. right after `stop-visio`). Pulls meeting metadata, board, participants, transcription, agenda (from the uploaded agenda document via `fetchAgendaText()`), pending decisions, expert insights → feeds Claude Sonnet 4.6 (8k tokens) → persists to `meeting_reports`. Idempotent: a previous report for the same meeting is deleted before insert.
- **Tables**: `meeting_reports` (migration 019, columns `title`, `content`, `agenda_used` JSONB, `generated_at`, `status` ∈ `generating` / `generated` / `error`; RLS: service-role write only, board members read). `meeting_decisions_pending` is referenced by the generator but still applied directly in Supabase — **no committed migration yet**.
- **API**: `GET /api/reports` (list, RLS-scoped) · `GET /api/reports/[id]` (single) · `POST /api/meetings/[id]/report` (trigger generation).

### Supabase Schema

Core: `profiles`, `boards` (enriched by migration 011 with SIREN, legal_form, size, revenue, employees, geo_zones, listed, strategic_context, competitors, key_clients, KPIs), `board_members`, `board_invitations`, `documents` (+ `category` from migration 020 — `NULL` for regular docs, `'agenda'` for the meeting's agenda document), `document_chunks` (vector(1024)), `conversations`, `conversation_messages`, `meetings` (+ `meeting_url`, `meeting_type`, `recall_bot_id`, `recall_bot_status` from migration 012, + `agenda` JSONB from migration 018), `meeting_participants`, `meeting_transcriptions`, `meeting_factchecks`, `meeting_moderations`, `meeting_suggestions`, `meeting_expert_insights`, `meeting_expert_config`, `meeting_blind_spots` (migration 017), `meeting_reports` (migration 019), `meeting_decisions_pending` (migration 021), `meeting_blind_spot_feedback` (migration 022).

Institutional memory (migration 011): `board_decisions`, `board_actions`, `board_engagement_commitments`, `board_tracked_topics` — feed `buildSystemPrompt()` via `EnrichedBoardContext` so the agent knows past decisions and open action items.

### Migrations (`supabase/migrations/`)

Applied in numerical order. Base schema in `supabase-setup.sql`. Apply via Supabase CLI or `psql -f`.

- `002_live_factcheck.sql` — live meeting tables
- `003_conversations.sql` — chat conversations
- `004_document_filter.sql` — document filters
- `005_auth_rls.sql` — initial RLS (superseded by 006)
- `006_boards_members.sql` — multi-member board system
- `007_fix_rls_and_profiles.sql` — RLS fixes
- `008_board_members_profiles_fk.sql` — FK board_members → profiles
- `009_meetings_scheduled_at.sql` — meeting scheduling
- `010_documents_meeting_id_uuid.sql` — meeting_id as UUID on documents
- `011_preparation_memory.sql` — institutional memory + board company profile
- `012_visio_support.sql` — meeting_type/url + Recall.ai bot columns
- `013_expert_panel.sql` — expert insights + config tables (Realtime on `meeting_expert_insights`)
- `014_fix_rls_null_board.sql` — RLS fallback for standalone meetings (NULL `board_id` was unreachable because `NULL = NULL → FALSE`)
- `015_multi_mic_speaker_id.sql` — adds `speaker_user_id` (FK `auth.users`) to `meeting_transcriptions` so multi-mic in-person sessions tag each segment with the real user, not a free-text label. Nullable for legacy + visio rows.
- `016_match_documents_board_members.sql` — fixes RAG: previous `match_documents` RPC filtered by `d.user_id = filter_user_id`, hiding board docs uploaded by other members. Now uploader-filter applies only to personal docs; board docs are visible to any member.
- `017_blind_spots.sql` — `meeting_blind_spots` (5th live pipeline) with polymorphic `source_reference`, severity / type / domain checks, indices, RLS by board member, Realtime enabled.
- `018_meeting_agenda.sql` — adds `meetings.agenda` JSONB column (`[{order, title, duration_min}, ...]`). Largely superseded by the agenda-as-document pattern from migration 020, but the column is still read in some legacy paths.
- `019_meeting_reports.sql` — `meeting_reports` (auto-generated compte rendu). Service-role write only, board members read.
- `020_document_category.sql` — adds `documents.category` (`NULL` / `'agenda'`) + partial index `(meeting_id, category) WHERE meeting_id IS NOT NULL`. Enables marking a document as the meeting's agenda so it can be RAG-indexed and surfaced to live pipelines.
- `021_meeting_decisions_pending.sql` — `meeting_decisions_pending` table for decisions / actions / commitments captured during live sessions. Feeds report generation.
- `022_blind_spot_feedback.sql` — `meeting_blind_spot_feedback` (thumbs up/down + comment per blind spot, used to tune relevance). Backs `/api/meetings/[id]/blind-spots/[spotId]/feedback`.

### Edge Functions (`supabase/functions/`, Deno)

- `send-board-invitation/` — Resend email on board invite
- `send-meeting-invitation/` — Resend email on meeting invite

### API Routes

Under `src/app/api/`:

**Boards**: `GET/POST /api/boards` · `GET/PUT/DELETE /api/boards/[id]` · `GET/POST/DELETE /api/boards/[id]/members` · `GET/POST/PATCH /api/boards/[id]/decisions` · `GET/POST/PATCH/DELETE /api/boards/[id]/actions`

**Invitations**: `GET/POST /api/invitations/[token]` · `GET /api/invitations/pending`

**RAG**: `POST /api/rag/process` · `POST /api/rag/search`

**Chat & Agents**: `POST /api/chat` (simple) · `POST /api/agent` (main) · `POST /api/agent-canvas` (PPTX) · `POST /api/agent-search` (web deep) · `POST /api/agent-thinking` (Opus thinking) · `POST /api/agent-unified` (orchestrator) · `GET/POST /api/conversations` · `GET /api/conversations/[id]/messages`

**Data broker**: `POST /api/data-broker` · `GET /api/data-broker/health`

**Meetings**: `GET/POST /api/meetings` · `GET /api/meetings/[id]` · `GET/POST/PATCH/DELETE /api/meetings/[id]/participants` · `GET/PUT /api/meetings/[id]/expert-panel` · `GET/PUT /api/meetings/[id]/expert-panel/config` · `GET/POST /api/meetings/[id]/blind-spots` · `GET/PUT /api/meetings/[id]/blind-spots/config` · `POST /api/meetings/[id]/blind-spots/[spotId]/feedback` · `POST /api/meetings/[id]/report`

**Reports**: `GET /api/reports` · `GET /api/reports/[id]`

**Documents**: `GET/POST /api/documents` · `GET/DELETE /api/documents/[id]` · `GET /api/documents/[id]/content`

**Live (in-person)**: `POST /api/live/start` · `GET /api/live/status` · `POST /api/live/stop` · `POST /api/live/audio` · `POST /api/live/mic-join` · `POST /api/live/mic-leave` (multi-mic — each participant connects their own device)

**Live (visio via Recall.ai)**: `POST /api/live/start-visio` · `POST /api/live/stop-visio` · `POST /api/live/webhook` · `GET /api/live/bot-status/[meetingId]`

### Meetings Page Architecture

`/dashboard/meetings` is a single page with 3 inline views (no sub-routes):

1. **List** — filters: Toutes / A venir / En cours / Terminées. Clickable cards open detail inline.
2. **Detail** (`MeetingDetail`) — participants with avatars + roles + admin actions, documents, action buttons (Préparer, Lancer en live). Admin can add exceptional guests and promote/demote/remove participants via confirmation modals.
3. **Live** (`LiveMeetingPanel`) — transcription / fact-check / moderation / suggestions / **expert panel** / **blind spots** dashboard. On the scheduled day only.

"Réunions" nav has no dropdown — direct link to the unified page.

### UI Components

- `src/components/ui/` — shadcn + custom primitives (spotlight-card, floating-navbar, board-selector, etc.)
- `src/components/chat/` — chat sidebar, message, input, empty state, `document-picker.tsx` (with `onDocumentsLoaded` callback), `response-stream.tsx` (live markdown render), `tool-activity.tsx`, `markdown-renderers.tsx`
- `src/components/meetings/` — meeting prep modal with document picker
- `src/app/dashboard/meetings/live/components/` — `ExpertPanel.tsx`, `BlindSpotsPanel.tsx`, `BlindSpotPopup.tsx`, `BlindSpotRequestModal.tsx`, `TranscriptionFeed.tsx`, `SpeakerStats.tsx`, `FactCheckPanel.tsx`, `ModerationAlerts.tsx`, `SuggestionsPanel.tsx`, `LiveMeetingControls.tsx`, `LivePanelDetailModal.tsx`

## Known Technical Patterns

- **PostgREST join limitation**: `meeting_participants.user_id` has FK to `auth.users(id)`, not `profiles(id)` — PostgREST cannot auto-join. Solution: 2 separate queries (participants + profiles by user_ids) merged server-side.
- **Meeting date vs status**: `meetings.status` doesn't auto-transition when `scheduled_at` passes. UI uses date comparison, not `status === "idle"`.
- **"All documents" selection**: `DocumentPicker` exposes `onDocumentsLoaded` with all doc IDs; when `selectedIds` is empty ("Tous") the parent falls back to `allDocIds`.
- **Agent last-round thinking**: when `followUps >= MAX_FOLLOW_UPS`, the Anthropic request uses `thinking` mode and **must not include tools** (API rejects the combination). See `src/lib/agent/index.ts`.
- **Data broker graceful degradation**: missing provider keys don't crash — circuit breaker marks unavailable and falls back per the chain in `layer3-providers/`.
- **Chat survives navigation**: chat state lives at module scope (`src/lib/chat-store.ts`), not in React hooks — unmounting doesn't lose the in-flight stream.
- **Standalone meetings**: meetings without a board (`board_id IS NULL`) require the migration 014 RLS fallback; otherwise they're unreachable because `NULL = NULL` returns FALSE in SQL.
- **Visio = Deepgram too**: Recall.ai is the bot layer; internally it still forwards audio to Deepgram nova-2. So both in-person and visio modes share the same transcription provider.
- **Service-role for background jobs**: `generateMeetingReport()` uses `createSupabaseServiceClient()` to read across RLS — needed because the job runs in the request that stopped the meeting, not in the requesting user's session. Any future post-meeting background job (e.g. extraction into institutional memory) must follow the same pattern.
- **Blind spots have separate tick intervals**: docs/memory detectors run on `BLIND_SPOTS_TICK_MS`; external detectors run on the longer `BLIND_SPOTS_EXTERNAL_INTERVAL_MS` to keep Data Broker cost down. Both states live on the orchestrator session.
- **Agenda is a document, not a JSON field**: even though `meetings.agenda` JSONB exists (migration 018), the live pipelines and report generator pull the agenda **from the document marked `category='agenda'`** for that meeting (`fetchAgendaText()`). Uploading or replacing the agenda goes through the regular RAG upload flow, just with `category='agenda'` set on the document.
- **In-person sessions reuse the existing meeting**: `/api/live/start` passes the meeting ID through `existingMeetingId` so the live session inherits the pre-uploaded agenda + docs + participants. Don't recreate a meeting on session start.

## Known Limitations

- **Resend email**: requires a verified custom domain. Board / meeting invitations and email verification won't send until configured.
- **Participant avatars**: only Google OAuth users have `avatar_url` populated; email/password users show a placeholder.
- **Meeting status**: no automatic DB transition from `idle` to `completed`; frontend uses date comparison.
- **Legifrance PISTE**: frequently returns 403 — data broker falls back to Brave automatically.
