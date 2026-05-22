# Feature : Live — Mode Visioconference

> Derniere mise a jour : 21 mars 2026

---

## Description

Mode de reunion a distance : un bot Recall.ai rejoint la visioconference (Zoom, Google Meet, Microsoft Teams) en tant que participant. Recall.ai transcrit via AssemblyAI et envoie les resultats par webhooks. Les transcriptions sont normalisees puis injectees dans les memes 4 pipelines que le mode presentiel.

---

## Flux

```
Visio (Zoom/Meet/Teams)
  → Bot Recall.ai rejoint la reunion
  → Recall.ai transcrit (AssemblyAI, detection multilingue)
  → Webhooks POST /api/live/webhook
  → Webhook Router (bot_id → meeting_id)
  → Transcript Adapter (normalise au format interne)
  → 4 pipelines paralleles (identiques au presentiel)
  → Supabase Writer → Realtime broadcast → frontend
```

---

## Composants

### Client Recall.ai (`recall-client.ts`)
- `createBot(meetingUrl, botName, webhookUrl)` → POST vers Recall.ai API
- `stopBot(botId)` → DELETE vers Recall.ai API
- `getBotStatus(botId)` → GET vers Recall.ai API
- Configuration : detection multilingue automatique (`language: "multi"`)
- Retry et gestion des erreurs

### Adapter de transcription (`recall-transcript-adapter.ts`)
- Normalise le format webhook Recall.ai → format interne
- Format interne : `{ speaker, content, timestamp_start, timestamp_end, confidence }`
- Mapping des noms de participants

### Webhook Router (`webhook-router.ts`)
- Recoit les webhooks Recall.ai (transcription + statut bot)
- Lookup `bot_id` → `meeting_id` via Supabase
- Injecte les transcriptions normalisees dans les pipelines
- Met a jour `recall_bot_status` en base

---

## Statut du bot

| Statut | Description |
|--------|-------------|
| `joining` | Le bot est en train de rejoindre la reunion |
| `in_call` | Le bot a rejoint et ecoute |
| `recording` | Le bot transcrit activement |
| `done` | La reunion est terminee |
| `error` | Erreur (reunion non trouvee, bot rejete, etc.) |

Le statut est affiche en temps reel sur le frontend (poll `/api/live/bot-status/[meetingId]`).

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/live/recall/recall-client.ts` | Client API Recall.ai |
| `src/lib/live/recall/recall-transcript-adapter.ts` | Normalisation des transcriptions |
| `src/lib/live/recall/webhook-router.ts` | Routage des webhooks |
| `src/app/api/live/webhook/route.ts` | Endpoint webhook Recall.ai |
| `src/app/api/live/start-visio/route.ts` | Demarrage session visio |
| `src/app/api/live/stop-visio/route.ts` | Arret session visio |
| `src/app/api/live/bot-status/[meetingId]/route.ts` | Statut du bot |

---

## Routes API

| Route | Methode | Description |
|-------|---------|-------------|
| `/api/live/start-visio` | POST | Cree un bot Recall.ai (lit meeting_url en base) |
| `/api/live/stop-visio` | POST | Supprime le bot Recall.ai |
| `/api/live/bot-status/[meetingId]` | GET | Statut du bot |
| `/api/live/webhook` | POST | Recoit les webhooks Recall.ai |

---

## Colonnes meetings (migration 012)

| Colonne | Type | Description |
|---------|------|-------------|
| `meeting_type` | TEXT | `in_person` ou `visio` (DEFAULT `in_person`) |
| `meeting_url` | TEXT | Lien Zoom/Meet/Teams |
| `recall_bot_id` | TEXT | ID du bot Recall.ai |
| `recall_bot_status` | TEXT | Statut du bot |

---

## Variables d'environnement

- `RECALL_API_KEY` — Cle API Recall.ai (obligatoire)
- `NEXT_PUBLIC_APP_URL` — URL publique de l'app (base URL pour les webhooks)

---

## Cout

~0.65 EUR/h par reunion visio :
- Recall.ai : ~0.50 EUR/h
- AssemblyAI (via Recall) : ~0.15 EUR/h

---

## Limitations

- En dev local, les webhooks necessitent un tunnel (ngrok) car Recall.ai doit atteindre `/api/live/webhook`
- Le webhook ne verifie pas de signature actuellement (a securiser)
- Les pipelines sont les memes que le presentiel — pas de difference de traitement
