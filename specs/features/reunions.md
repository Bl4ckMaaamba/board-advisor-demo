# Feature : Reunions — Page Unifiee

> Derniere mise a jour : 21 mars 2026

---

## Description

Page unique `/dashboard/meetings` avec 3 vues inline : liste, detail et live. Gestion des participants avec roles, invites exceptionnels, et preparation de reunion via le chatbot.

---

## Vue liste

- Filtres par statut : Toutes / A venir / En cours / Terminees
- Cartes de reunion avec :
  - Titre, description, date planifiee
  - Badge de statut (idle, recording, completed)
  - Badge de type (presentiel / visio)
  - Compteurs de documents et participants
- Clic sur une carte → vue detail

Le filtre "A venir" / "Terminees" utilise `scheduled_at` vs date actuelle (pas le champ `status` qui ne se met pas a jour automatiquement).

---

## Vue detail (MeetingDetail)

### Informations
- Titre, description, date, heure
- Type : presentiel ou visio (avec lien de reunion si visio)

### Participants
- **Permanents** : auto-ajoutes depuis les membres du board (trigger `auto_populate_meeting_participants`)
- **Exceptionnels** : ajoutes manuellement par l'admin
- Affichage : avatar, nom, role (admin/member), type (permanent/exceptionnel)
- Actions admin :
  - Promouvoir un membre en admin
  - Supprimer un participant (popup de confirmation)
  - Ajouter un invite exceptionnel (email + role)

### Documents
- Documents lies a la reunion

### Actions
- **"Preparer"** → ouvre le chatbot avec les documents de la reunion pre-selectionnes
- **"Lancer en live"** → demarre la session live (conditions : admin uniquement, jour de la reunion)

---

## Vue live (LiveMeetingPanel)

Accessible uniquement a l'admin, le jour de la reunion.

- Transcription en direct avec attribution des locuteurs
- Panel de fact-checking (affirmations detectees + verdicts)
- Alertes de moderation (ton, interruptions, hors-sujet)
- Panel de suggestions (actions, questions, references)
- Statistiques par locuteur (temps de parole, nombre de mots)
- Indicateur de latence du pipeline
- Bouton d'arret de la reunion

Les donnees arrivent via Supabase Realtime (subscriptions sur les tables meeting_*).

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/app/dashboard/meetings/page.tsx` | Page unifiee (liste + detail + live) |
| `src/app/dashboard/meetings/live/components/*.tsx` | Composants du dashboard live |
| `src/app/dashboard/meetings/live/hooks/*.ts` | Hooks Realtime (useRealtimeTranscription, etc.) |
| `src/app/api/meetings/route.ts` | CRUD reunions |
| `src/app/api/meetings/[id]/route.ts` | Detail reunion |
| `src/app/api/meetings/[id]/participants/route.ts` | Gestion participants |
| `src/components/meetings/` | Composants reunions (prep modal avec document picker) |

---

## Tables concernees

- `meetings` — Metadata (titre, board_id, status, scheduled_at, meeting_type, meeting_url)
- `meeting_participants` — Participants (user_id, email, role, type, status)
- `meeting_transcriptions` — Segments de transcription live
- `meeting_factchecks` — Affirmations verifiees
- `meeting_moderations` — Alertes de moderation
- `meeting_suggestions` — Suggestions IA

---

## RPC

- `transfer_meeting_admin(meeting_id, new_admin_user_id)` — Transfere le role d'admin de reunion

---

## Navigation

"Reunions" dans la navbar → clic direct vers `/dashboard/meetings` (pas de sous-menu dropdown).
