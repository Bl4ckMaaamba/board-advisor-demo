# Board Advisor — Routes API

> Derniere mise a jour : 21 mars 2026
> Toutes les routes sont sous `src/app/api/`

---

## Boards

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/boards` | GET | Oui | Liste les boards de l'utilisateur (via vue `my_boards`) |
| `/api/boards` | POST | Oui | Cree un board (nom, description, secteur). Le trigger `auto_add_board_owner` ajoute le createur comme owner |
| `/api/boards/[id]` | GET | Oui | Detail d'un board + membres + invitations en attente |
| `/api/boards/[id]` | PUT | Admin/Owner | Met a jour un board (nom, description, secteur, profil sectoriel) |
| `/api/boards/[id]` | DELETE | Owner | Supprime un board |
| `/api/boards/[id]/members` | GET | Membre | Liste les membres d'un board |
| `/api/boards/[id]/members` | POST | Admin/Owner | Invite un membre par email (envoie un email via Edge Function) |
| `/api/boards/[id]/members` | DELETE | Admin/Owner | Supprime un membre (via RPC `remove_board_member`) |

## Invitations

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/invitations/[token]` | GET | Oui | Verifie une invitation (valide, non expiree, email correspondant) |
| `/api/invitations/[token]` | POST | Oui | Accepte une invitation (via RPC `accept_board_invitation`) |

## Documents

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/documents` | GET | Oui | Liste les documents, filtre par `board_id` (query param) |
| `/api/rag/process` | POST | Oui | Upload + indexation. FormData : `file`, `board_id`. Pipeline : extraction → chunking → embeddings → stockage |
| `/api/rag/search` | POST | Oui | Recherche semantique. JSON : `query`, `board?`, `matchCount?`. Retourne les chunks les plus pertinents |

## Chat IA

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/agent` | POST | Oui | Chat agentique avec tool use. Streaming SSE. JSON : `messages`, `conversationId?`, `boardId?`, `selectedDocumentIds?` |
| `/api/conversations` | GET | Oui | Liste les conversations de l'utilisateur |
| `/api/conversations/[id]/messages` | GET | Oui | Historique des messages d'une conversation |

## Reunions

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/meetings` | GET | Oui | Liste les reunions, filtre par `board_id` |
| `/api/meetings` | POST | Oui | Cree une reunion. JSON : `title`, `description?`, `board_id`, `scheduled_at?`, `meeting_type?`, `meeting_url?` |
| `/api/meetings/[id]` | GET | Oui | Detail d'une reunion |
| `/api/meetings/[id]/participants` | GET | Membre | Liste les participants avec profils (2 queries + merge) |
| `/api/meetings/[id]/participants` | POST | Admin | Ajoute un invite exceptionnel. JSON : `email`, `role?` |
| `/api/meetings/[id]/participants` | PATCH | Admin | Met a jour le role d'un participant |
| `/api/meetings/[id]/participants` | DELETE | Admin | Supprime un participant |

## Live (Presentiel)

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/live/start` | POST | Oui | Demarre une session live (mode presentiel, Deepgram) |
| `/api/live/stop` | POST | Oui | Arrete la session live |
| `/api/live/status` | GET | Oui | Statut de la session active |
| `/api/live/audio` | POST | Oui | Envoie un chunk audio (binaire) |

## Live (Visio)

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/live/start-visio` | POST | Oui | Demarre une session visio. Cree un bot Recall.ai qui rejoint le lien de reunion. JSON : `meeting_id` |
| `/api/live/stop-visio` | POST | Oui | Arrete la session visio. Supprime le bot Recall.ai. JSON : `meeting_id` |
| `/api/live/bot-status/[meetingId]` | GET | Oui | Statut du bot Recall.ai (joining, in_call, recording, done, error) |
| `/api/live/webhook` | POST | Non* | Endpoint pour les webhooks Recall.ai (transcription + changement de statut bot). *Auth par signature webhook |

---

## Edge Functions (Supabase/Deno)

| Fonction | Methode | Description |
|----------|---------|-------------|
| `send-board-invitation` | POST | Envoie un email d'invitation a un board via Resend. Appele par `/api/boards/[id]/members` POST |
| `send-meeting-invitation` | POST | Envoie un email d'invitation a une reunion via Resend |
