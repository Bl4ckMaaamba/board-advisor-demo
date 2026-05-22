# Board Advisor — Variables d'Environnement

> Derniere mise a jour : 21 mars 2026
> Fichier : `.env.local`

---

## Supabase (obligatoires)

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle publique Supabase (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service (Edge Functions, operations admin) |

## IA (obligatoires)

| Variable | Usage |
|----------|-------|
| `ANTHROPIC_API_KEY` | Claude (chatbot Sonnet, reranking Haiku, classification Haiku) |
| `VOYAGE_API_KEY` | Voyage (embeddings 1024 dimensions pour le RAG) |
| `OPENAI_API_KEY` | OpenAI (legacy, peut etre requis par certains composants) |

## Data Broker (fonctionnalites chat)

| Variable | Usage | Obligatoire |
|----------|-------|-------------|
| `BRAVE_API_KEY` | Brave Search (recherche web) | Oui pour le chat |
| `TAVILY_API_KEY` | Tavily Search (recherche web alternative) | Optionnel |
| `FMP_API_KEY` | Financial Modeling Prep (donnees financieres) | Oui pour finance |
| `PAPPERS_API_KEY` | Pappers (donnees entreprises FR) | Oui pour entreprises FR |
| `NEWSAPI_API_KEY` | NewsAPI (actualites) | Optionnel |
| `FRED_API_KEY` | FRED (indicateurs macro US) | Optionnel |

## Live / Transcription

| Variable | Usage | Obligatoire |
|----------|-------|-------------|
| `DEEPGRAM_API_KEY` | Deepgram (transcription live mode presentiel) | Pour mode presentiel |
| `RECALL_API_KEY` | Recall.ai (bot visioconference) | Pour mode visio |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app (base URL pour webhooks Recall.ai) | Pour mode visio |

## Email

| Variable | Usage | Obligatoire |
|----------|-------|-------------|
| `RESEND_API_KEY` | Resend (envoi d'emails via Edge Functions) | Pour invitations |

---

## Notes

- Les variables `NEXT_PUBLIC_*` sont exposees cote client (browser)
- `SUPABASE_SERVICE_ROLE_KEY` ne doit JAMAIS etre exposee cote client
- `RECALL_API_KEY` necessite un compte sur recall.ai
- `NEXT_PUBLIC_APP_URL` doit etre accessible publiquement pour que Recall.ai puisse envoyer ses webhooks (en dev : utiliser ngrok ou similaire)
- Resend necessite un nom de domaine verifie pour envoyer des emails
