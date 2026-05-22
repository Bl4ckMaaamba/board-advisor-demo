# Board Advisor

Plateforme de gouvernance d'entreprise assistée par IA pour administrateurs de conseil d'administration. Prépare les réunions, gère les documents, fournit un chatbot agentique avec RAG sur les documents internes + sources externes, exécute cinq pipelines en direct pendant les réunions (fact-check, modération, suggestion, panel d'experts, angles morts), et génère automatiquement un compte rendu après chaque session. Interface en français.

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Copier le fichier d'environnement
cp .env.local.example .env.local
# puis remplir au minimum : ANTHROPIC_API_KEY, VOYAGE_API_KEY, et les 4 variables Supabase

# 3. Appliquer le schéma DB (Supabase project requis)
psql "$DATABASE_URL" -f supabase-setup.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# 4. Lancer le serveur de dev
npm run dev
# → http://localhost:3000
```

## Stack technique

- **Framework** : Next.js 14 (App Router, React 18, TypeScript)
- **UI** : Tailwind CSS + Radix UI + shadcn/ui + Framer Motion
- **Database** : Supabase (PostgreSQL + pgvector + Realtime)
- **LLMs** : Claude Sonnet 4.6 / Opus 4.6 / Haiku 4.5 (Anthropic)
- **Embeddings** : Voyage 4 (1024 dimensions)
- **Audio live** : Deepgram (présentiel) / Recall.ai (visio)

## Architecture

L'architecture détaillée — routing, RAG pipeline, agent system, data broker, pipelines live, schéma Supabase — est documentée dans [`CLAUDE.md`](./CLAUDE.md) (~320 lignes, lisible en 10 min).

Les cahiers des charges fonctionnels sont dans [`specs/`](./specs/) et la spec du data broker dans [`docs/DATA_BROKER.md`](./docs/DATA_BROKER.md).

## Scripts

```bash
npm run dev      # serveur de dev avec heap 8GB (pour pdf-parse + RAG)
npm run build    # build production
npm run lint     # ESLint
npm run start    # serveur production
```

## Variables d'environnement

Voir [`.env.local.example`](./.env.local.example). Les clés sont divisées en deux groupes :

- **Required** — Supabase + Anthropic + Voyage + URL publique. Sans elles, l'app ne boote pas.
- **Optional** — Deepgram, Recall.ai, OpenRouter, providers du data broker, Upstash, Resend. Chaque feature qui en dépend dégrade gracieusement si la clé manque (circuit breaker côté data broker, désactivation côté UI ailleurs).

Le sous-ensemble minimal `Supabase + Anthropic` suffit pour faire tourner : auth, chatbot, agent, RAG (avec Voyage), gestion documents, gestion boards.
