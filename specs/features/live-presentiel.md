# Feature : Live — Mode Presentiel

> Derniere mise a jour : 21 mars 2026

---

## Description

Mode de reunion en presentiel : capture du microphone de l'utilisateur, envoi du flux audio vers Deepgram en WebSocket, transcription en temps reel, puis traitement par 4 pipelines IA concurrents.

---

## Flux

```
Micro → AudioWorklet → Chunks audio → Deepgram WebSocket → Transcription
  → Buffer de transcription (confiance, speaker)
  → 4 pipelines paralleles :
    ├── Claim Detection → extrait les affirmations factuelles
    ├── Fact-Checking → verifie via web + IA (vrai/faux/partiel)
    ├── Moderation → analyse ton et sentiment
    └── Suggestions → genere actions, questions, references
  → Supabase Writer → ecrit en base
  → Realtime broadcast → frontend
```

---

## Orchestrateur

Le fichier `orchestrator.ts` gere les sessions en memoire :
- Etat global de la session (meeting_id, status, metriques)
- Demarrage/arret de la session
- Dispatch des transcriptions vers les 4 pipelines
- Metriques : chunks total, segments, claims, latence moyenne, duree

---

## 4 Pipelines

### Claim Detection (`claim-detector.ts`)
- Recoit les segments de transcription
- Extrait les affirmations factuelles via Claude
- Passe les claims au fact-checker

### Fact-Checking (`fact-checker.ts`)
- Recoit un claim
- Recherche web pour verification
- Claude juge : `true`, `false`, `unverifiable`, `partial`, `needs_context`
- Confidence score + explication + sources

### Moderation (`moderator.ts`)
- Analyse le ton et le sentiment du segment
- Types : tone, interruption, speaking_time, off_topic, conflict
- Severite : info, warning, alert

### Suggestions (`suggester.ts`)
- Genere des recommandations basees sur la discussion
- Types : deep_dive, question, action_item, reference
- Priorite : low, medium, high

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/live/orchestrator.ts` | Orchestrateur de session |
| `src/lib/live/audio/audio-processor.ts` | Traitement audio (AudioWorklet) |
| `src/lib/live/transcription/deepgram-client.ts` | Client WebSocket Deepgram |
| `src/lib/live/transcription/transcription-buffer.ts` | Buffer de transcription |
| `src/lib/live/pipelines/claim-detector.ts` | Pipeline detection d'affirmations |
| `src/lib/live/pipelines/fact-checker.ts` | Pipeline fact-checking |
| `src/lib/live/pipelines/moderator.ts` | Pipeline moderation |
| `src/lib/live/pipelines/suggester.ts` | Pipeline suggestions |
| `src/lib/live/delivery/supabase-writer.ts` | Ecriture en base |
| `src/lib/live/delivery/realtime-config.ts` | Config Realtime broadcast |
| `src/lib/live/utils/speaker-tracker.ts` | Tracking des locuteurs |
| `src/lib/live/utils/latency-monitor.ts` | Monitoring latence |
| `src/lib/live/utils/logger.ts` | Logger |
| `src/lib/live/schemas.ts` | Schemas Zod |
| `src/lib/live/index.ts` | Exports |

---

## Routes API

| Route | Methode | Description |
|-------|---------|-------------|
| `/api/live/start` | POST | Demarre la session (Deepgram) |
| `/api/live/stop` | POST | Arrete la session |
| `/api/live/status` | GET | Statut de la session |
| `/api/live/audio` | POST | Envoie un chunk audio |

---

## Variable d'environnement

- `DEEPGRAM_API_KEY` — Cle API Deepgram (obligatoire pour ce mode)
