# Board Advisor

Plateforme de gouvernance d'entreprise assistée par IA pour administrateurs de conseil d'administration. Prépare les réunions, gère les documents, fournit un chatbot agentique avec RAG sur les documents internes + sources externes, exécute cinq pipelines en direct pendant les réunions (fact-check, modération, suggestion, panel d'experts, angles morts), et génère automatiquement un compte rendu après chaque session. Interface en français.

> 📘 **Pour le devoir** : voir [`DEVOIR.md`](./DEVOIR.md) à la racine — consigne, critère de réussite, fichiers à modifier, API à utiliser.

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Copier le fichier d'environnement
cp .env.local.example .env.local
# remplir au minimum :
#   - NEXT_PUBLIC_SUPABASE_URL
#   - NEXT_PUBLIC_SUPABASE_ANON_KEY
#   - SUPABASE_SERVICE_ROLE_KEY
#   - DATABASE_URL
#   - ANTHROPIC_API_KEY
#   - VOYAGE_API_KEY               (si test du RAG)
#   - NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Appliquer le schéma DB sur le projet Supabase
psql "$DATABASE_URL" -f supabase-setup.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# 4. Lancer le serveur de dev
npm run dev
# → http://localhost:3000
```

> Le compte Supabase + la clé Anthropic vous sont fournis séparément pour le devoir.

## Stack technique

- **Framework** : Next.js 14 (App Router, React 18, TypeScript)
- **UI** : Tailwind CSS + Radix UI + shadcn/ui + Framer Motion
- **Database** : Supabase (PostgreSQL + pgvector + Realtime)
- **LLMs** : Claude Sonnet 4.6 / Opus 4.6 / Haiku 4.5 (Anthropic)
- **Embeddings** : Voyage 4 (1024 dimensions)
- **Audio live** : Deepgram (présentiel) / Recall.ai (visio)
- **Recherche externe** : Perplexity Sonar Deep Research via OpenRouter

## Vue d'ensemble de l'architecture

Trois piliers indépendants :

### 1. Agent agentique (`src/lib/agent/`)
Chatbot conversationnel avec **registry de 7 tools externes** exécutés en parallèle. Orchestration en deux phases (planning + synthèse), streaming SSE, extraction automatique des sources, support du mode "thinking" (Opus + extended thinking). Routes : `/api/agent`, `/api/agent-thinking`, `/api/agent-unified`, `/api/agent-canvas`.

C'est sur cette partie que porte le devoir — voir [`DEVOIR.md`](./DEVOIR.md).

### 2. RAG (`src/lib/rag.ts`)
Indexation de documents (PDF/DOCX/XLSX) avec chunking français-aware (sections `Article N`, `Résolution`, etc.), embeddings Voyage 4 (1024 dims), pgvector pour la recherche sémantique, reranking Claude Haiku. RLS scoped par board.

### 3. Live meetings (`src/lib/live/`)
Pipeline temps réel pour les réunions : transcription (Deepgram direct en présentiel, Recall.ai en visio), puis 5 pipelines concurrents — fact-check, modération, suggestion, panel d'experts (10 personas), angles morts. Persistance Supabase + Realtime pour la sync UI. Compte rendu auto-généré en fin de session.

**Documentation complète** : [`CLAUDE.md`](./CLAUDE.md) (~320 lignes, ~10 min de lecture). Cahiers des charges par feature dans [`specs/features/`](./specs/features/). Spec du data broker dans [`docs/DATA_BROKER.md`](./docs/DATA_BROKER.md).

## Structure du projet

```
.
├── DEVOIR.md                 ← Consigne du devoir
├── CLAUDE.md                 ← Architecture détaillée (à lire en premier)
├── README.md                 ← Ce fichier
├── .env.local.example        ← Variables d'environnement (required / optional)
├── src/
│   ├── app/                  ← Routes Next.js App Router
│   │   ├── api/              ← Routes API (agent, rag, meetings, live, …)
│   │   └── dashboard/        ← Pages UI authentifiées
│   ├── components/           ← Composants React (chat, meetings, UI primitives)
│   ├── lib/
│   │   ├── agent/            ← Agent + tools (point d'extension du devoir)
│   │   ├── rag.ts            ← Pipeline RAG (chunking, embeddings, search)
│   │   ├── data-broker/      ← Orchestrateur 10 providers externes
│   │   ├── live/             ← Pipelines temps réel (5 pipelines)
│   │   └── reports/          ← Génération de compte rendu post-réunion
│   └── middleware.ts         ← Auth guards
├── supabase/
│   ├── migrations/           ← 22 migrations SQL numérotées (002 → 022)
│   └── functions/            ← Edge Functions Deno (envoi d'emails Resend)
├── supabase-setup.sql        ← Schéma de base à appliquer en premier
└── specs/                    ← Cahiers des charges fonctionnels par feature
```

## Scripts

```bash
npm run dev      # serveur de dev avec heap 8GB (pour pdf-parse + RAG)
npm run build    # build production
npm run lint     # ESLint (0 erreur attendue ; 4 warnings hooks-deps tolérés)
npm run start    # serveur production
npx tsc --noEmit # vérification types (0 erreur attendue)
```

## Variables d'environnement

Voir [`.env.local.example`](./.env.local.example). Les clés sont divisées en deux groupes :

- **Required** (5 clés) — Supabase (4) + Anthropic. Sans elles, l'app ne boote pas.
- **Optional** — Voyage, Deepgram, Recall.ai, OpenRouter, providers du data broker (Brave, Tavily, FMP, Pappers, NewsAPI, PISTE, FRED), Upstash, Resend. Chaque feature qui en dépend **dégrade gracieusement** si la clé manque : circuit breaker côté data broker, désactivation côté UI ailleurs.

| Pour faire tourner… | Clés requises |
|---|---|
| Auth + boards + documents | Supabase (4 clés) |
| Chatbot agentique (tools externes désactivés) | + `ANTHROPIC_API_KEY` |
| RAG (recherche dans documents uploadés) | + `VOYAGE_API_KEY` |
| Devoir BODACC | rien de plus (BODACC est sans clé) |
| Réunion en visio | + `RECALL_API_KEY` |
| Réunion en présentiel | + `DEEPGRAM_API_KEY` |
| Data broker complet | + clés des providers utilisés |

## Conventions de code

- **Composants React** : fonctionnels uniquement, hooks pour la state.
- **Styling** : Tailwind. Pas de CSS modules ni styled-components.
- **API routes** : sous `src/app/api/*/route.ts`, App Router.
- **Types** : TypeScript strict, types partagés sous `src/lib/types/`.
- **Migrations SQL** : numérotées séquentiellement, appliquées dans l'ordre via `psql -f`.
- **RLS** : board-member-scoped sur toutes les tables métier ; fallback `NULL`-safe pour les meetings sans board (cf. migration 014).

## Notes pour la démo

- L'app est en **français**.
- Pas de framework de tests configuré — la vérification se fait via `tsc` + `lint` + dev server.
- Le build production passe sans `ignoreBuildErrors` (build propre garanti).
- Les pipelines live nécessitent un meeting actif ; le devoir BODACC ne touche que le chat et n'a donc pas besoin de simuler une réunion.

## Limitations connues

- **Resend email** : nécessite un domaine custom vérifié. Les invitations email ne partent pas sans cette config.
- **Legifrance PISTE** : retourne fréquemment des 403 ; le data broker fallback automatiquement sur Brave.
- **Avatars** : seuls les comptes Google OAuth ont un `avatar_url` ; comptes email/password montrent un placeholder.
- **Status meeting** : pas de transition auto `idle → completed` en DB ; le frontend utilise la comparaison de dates.

Voir aussi [`specs/limitations-connues.md`](./specs/limitations-connues.md).
