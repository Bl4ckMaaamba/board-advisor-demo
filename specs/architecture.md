# Board Advisor — Architecture Technique

> Derniere mise a jour : 21 mars 2026

---

## Stack technique

| Couche | Technologie |
|--------|------------|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, Radix UI primitives, Framer Motion |
| Polices | Playfair Display (titres), DM Sans (corps) |
| Base de donnees | Supabase (PostgreSQL + pgvector) |
| Authentification | Supabase Auth (Google OAuth + email/password) |
| IA / LLM | Claude Sonnet (chatbot), Claude Haiku (reranking, classification) |
| Embeddings | Voyage 4 (1024 dimensions) |
| Transcription presentiel | Deepgram WebSocket |
| Transcription visio | AssemblyAI via Recall.ai |
| Bot visioconference | Recall.ai (Zoom, Google Meet, Microsoft Teams) |
| Recherche web | Brave Search, Tavily, NewsAPI, Google News RSS |
| Finance | Financial Modeling Prep (FMP), Pappers |
| Juridique | Legifrance PISTE API |
| Macro-economie | FRED (Federal Reserve), World Bank |
| Cache | LRU-cache (L1), Upstash Redis (L2), Supabase (L3) |
| Graphiques | Recharts |
| Parsing documents | pdf-parse, mammoth (DOCX), xlsx |
| Email | Resend (via Supabase Edge Functions) |

---

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── login/page.tsx                    # Connexion (3 onglets : login, register, forgot)
│   ├── auth/callback/route.ts            # Echange code OAuth
│   ├── invite/board/[token]/page.tsx      # Acceptation invitation
│   ├── dashboard/
│   │   ├── page.tsx                      # Dashboard principal
│   │   ├── chat/page.tsx                 # Chatbot IA
│   │   ├── documents/page.tsx            # Documents
│   │   ├── meetings/page.tsx             # Reunions (liste + detail + live)
│   │   ├── boards/                       # Gestion des boards
│   │   ├── reports/                      # Rapports
│   │   └── account/page.tsx              # Compte
│   └── api/                              # Routes API (voir api-routes.md)
├── components/
│   ├── ui/                               # Primitives UI (spotlight-card, floating-navbar, board-selector...)
│   ├── chat/                             # Composants chatbot (sidebar, message, input, document-picker)
│   └── meetings/                         # Composants reunions (prep modal)
├── lib/
│   ├── agent/                            # Systeme agentique (tools, prompt, conversation)
│   ├── live/                             # Orchestration live (pipelines, transcription, recall)
│   │   ├── pipelines/                    # 4 pipelines (claim, factcheck, moderation, suggestions)
│   │   ├── delivery/                     # Supabase writer + Realtime config
│   │   ├── transcription/                # Buffer de transcription
│   │   ├── audio/                        # Audio processor (mode presentiel)
│   │   ├── recall/                       # Client Recall.ai + adapter + webhook router
│   │   ├── utils/                        # Speaker tracker, latency monitor, logger
│   │   ├── orchestrator.ts               # Orchestrateur de session live
│   │   ├── schemas.ts                    # Schemas Zod
│   │   └── index.ts                      # Exports
│   ├── data-broker/                      # Integration donnees externes (5 couches)
│   ├── rag.ts                            # Pipeline RAG (chunking, embeddings, reranking)
│   ├── extract-text.ts                   # Extraction texte (PDF, DOCX, XLSX)
│   ├── board-context.tsx                 # Contexte global des boards (BoardProvider)
│   ├── types/boards.ts                   # Types TypeScript du systeme boards
│   ├── supabase.ts                       # Client Supabase (client-side)
│   └── supabase-server.ts               # Client Supabase (server-side + getAuthenticatedUser)
└── middleware.ts                          # Protection des routes auth
```

---

## Patterns techniques importants

### Auth : double client Supabase

- `src/lib/supabase.ts` — Client **client-side** (browser, composants React)
- `src/lib/supabase-server.ts` — Client **server-side** (API routes, server components) avec `getAuthenticatedUser()` qui retourne l'utilisateur authentifie ou throw une erreur

### Board Context

`src/lib/board-context.tsx` fournit un `BoardProvider` + `useBoardContext()` hook pour le filtrage global par board. Les boards sont fetches depuis `/api/boards` (vue Supabase `my_boards`). Le helper `matchesBoard()` filtre les items par `board_id`.

### PostgREST join limitation

`meeting_participants.user_id` a une FK vers `auth.users(id)`, PAS vers `profiles(id)`. PostgREST ne peut pas auto-joindre vers `profiles`. Solution : 2 requetes separees (participants + profiles par user_ids) puis merge cote API.

### Statut des reunions

Le champ `status` ne se met pas a jour automatiquement quand la date passe. Le frontend utilise une comparaison de `scheduled_at` pour la logique "a venir" vs "passee".

### Document Picker

`DocumentPicker` a un callback `onDocumentsLoaded` qui envoie tous les IDs au parent. Quand `selectedIds` est vide (= "Tous les documents"), le parent utilise `allDocIds` comme fallback.

### Pipeline RAG

1. **Upload** (`/api/rag/process`) : File → `extractText()` → `chunkText()` (2000 chars, 300 overlap) → `generateEmbeddings()` (Voyage 4) → stocke dans `document_chunks`
2. **Search** (`/api/rag/search`) : Query → embedding → `match_documents` RPC (pgvector cosinus, seuil 0.5) → reranking Haiku (score 0-10, filtre 6+, top 4)
3. **Chat** (`/api/agent`) : Chatbot agentique avec tool use

### Live : 2 modes, memes pipelines

- **Presentiel** : Micro → AudioWorklet → Deepgram WebSocket → transcription → 4 pipelines
- **Visio** : Recall.ai bot rejoint la visio → webhooks `/api/live/webhook` → adapter normalise → memes 4 pipelines

Les 4 pipelines (claim detection, fact-checking, moderation, suggestions) sont identiques quel que soit le mode. Seule la source de transcription change.

---

## Routing (App Router)

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Login/register/forgot password (Google OAuth + email/password) |
| `/auth/callback` | OAuth code exchange → redirect `/dashboard` |
| `/dashboard` | Dashboard principal (dans `BoardProvider` context) |
| `/dashboard/boards`, `/boards/[id]`, `/boards/new` | Gestion des boards |
| `/dashboard/meetings` | Page unifiee reunions (liste → detail → live) |
| `/dashboard/documents` | Upload + liste documents |
| `/dashboard/reports`, `/reports/[id]` | Rapports |
| `/dashboard/chat` | Chatbot IA avec RAG |
| `/dashboard/account` | Compte utilisateur |
| `/invite/board/[token]` | Acceptation d'invitation board |
