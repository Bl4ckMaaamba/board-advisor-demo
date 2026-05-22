# Feature : Gestion des Boards

> Derniere mise a jour : 21 mars 2026

---

## Description

Systeme multi-membres avec roles hierarchiques pour organiser les conseils d'administration. Chaque board regroupe des membres, documents, reunions et conversations.

---

## Roles

| Role | Permissions |
|------|------------|
| **owner** | Tout (supprimer le board, gerer tous les membres) |
| **admin** | Gerer les membres (sauf admin/owner), modifier le board, creer des reunions |
| **member** | Lecture seule + upload de documents + participation chat |

---

## Fonctionnalites

### Creation de board
- Nom, description, secteur d'activite
- Le createur est automatiquement ajoute comme `owner` (trigger `auto_add_board_owner`)

### Profil sectoriel enrichi (migration 011)
- SIREN, forme juridique, siege social
- Taille (startup/PME/ETI/grande entreprise), CA, effectifs
- Zones geographiques, cote en bourse, contexte strategique
- Concurrents (JSONB), clients cles (JSONB), KPIs suivis

### Membres
- Invitation par email avec token unique (expiration 7 jours)
- Page d'acceptation `/invite/board/[token]` (verifie l'email correspond)
- Promotion/retrogradation avec popup de confirmation
- Suppression de membres avec confirmation
- Protection : impossible de supprimer le dernier owner

### Filtrage global
- `BoardProvider` + `useBoardContext()` pour filtrer toute l'app par board
- Vue Supabase `my_boards` pour ne voir que ses boards
- Helper `matchesBoard()` pour filtrer les items par `board_id`

---

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/board-context.tsx` | BoardProvider + useBoardContext() |
| `src/lib/types/boards.ts` | Types TypeScript |
| `src/lib/api/boards.ts` | Fonctions API helper (server-side) |
| `src/app/dashboard/boards/` | Pages de gestion des boards |
| `src/app/api/boards/` | Routes API boards + membres |
| `src/app/api/invitations/` | Routes API invitations |
| `src/app/invite/board/[token]/page.tsx` | Page acceptation invitation |

---

## Tables concernees

- `boards` — Metadata des boards + profil sectoriel
- `board_members` — Pivot d'appartenance (board_id, user_id, role, expertise, bio)
- `board_invitations` — Invitations par email avec token

---

## RPCs

- `accept_board_invitation(token)` — Accepte une invitation (verifie email, cree membership)
- `remove_board_member(board_id, user_id)` — Supprime un membre (protections hierarchiques)

---

## Edge Functions

- `send-board-invitation` — Envoie l'email d'invitation via Resend

---

## Limitations

- L'envoi d'email necessite un domaine verifie dans Resend
- Le lien d'invitation doit etre partage manuellement en attendant
