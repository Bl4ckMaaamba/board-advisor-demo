# Board Advisor — Securite

> Derniere mise a jour : 21 mars 2026

---

## Authentification

### Methodes supportees

| Methode | Flow |
|---------|------|
| Google OAuth | `signInWithOAuth({ provider: "google" })` → `/auth/callback` → echange code → `/dashboard` |
| Email/Password | `signUp()` / `signInWithPassword()` via Supabase Auth |
| Reset password | `resetPasswordForEmail()` → email avec lien de reinitialisation |

### Middleware

Le middleware (`src/middleware.ts`) protege les routes :
- `/dashboard/*` — redirige vers `/login?next=...` si non authentifie
- `/invite/*` — redirige vers `/login?next=...` si non authentifie

Apres login, l'utilisateur est redirige vers la page qu'il voulait atteindre (parametre `next`).

### Profile auto-creation

Trigger PostgreSQL `handle_new_user()` cree automatiquement une ligne dans `profiles` quand un utilisateur s'inscrit dans `auth.users`.

---

## Row Level Security (RLS)

**Principe general** : toutes les tables liees a un board utilisent le pattern board-member-scoped :

```sql
EXISTS (
  SELECT 1 FROM board_members
  WHERE board_members.board_id = <table>.board_id
  AND board_members.user_id = auth.uid()
)
```

### Matrice de permissions

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Tout utilisateur authentifie | Son propre profil | Son propre profil | - |
| boards | Membres du board | Owner (auth.uid() = owner_id) | Admin/Owner | Owner uniquement |
| board_members | Membres du board | Admin/Owner | Admin/Owner | Admin/Owner |
| board_invitations | Admin/Owner + invite (par email) | Admin/Owner | Admin/Owner + invite | - |
| documents | Membres du board | Membre + auth.uid() = user_id | Membres du board | Owner du doc OU Admin/Owner du board |
| document_chunks | Via JOIN document → board_members | Via JOIN document → board_members | Via JOIN document → board_members | Via JOIN document → board_members |
| conversations | Owner de la conversation OU membres du board | auth.uid() = user_id | Owner de la conversation | Owner de la conversation |
| conversation_messages | Via JOIN conversation → owner OU board_members | Via JOIN conversation → owner | - | - |
| meetings | Membres du board | Membre + auth.uid() = user_id | Creator, admin_user_id, ou Admin/Owner du board | - |
| meeting_participants | Via JOIN meeting → board_members | Creator, admin_user_id, ou Admin/Owner du board | Participant lui-meme OU creator/admin_user_id | Creator, admin_user_id, ou Admin/Owner du board |
| meeting_transcriptions | Via JOIN meeting → board_members | Via JOIN meeting → board_members | - | - |
| meeting_factchecks | Via JOIN meeting → board_members | Via JOIN meeting → board_members | - | - |
| meeting_moderations | Via JOIN meeting → board_members | Via JOIN meeting → board_members | - | - |
| meeting_suggestions | Via JOIN meeting → board_members | Via JOIN meeting → board_members | - | - |
| board_decisions | Membres du board | Membres du board | Admin/Owner | Admin/Owner |
| board_actions | Membres du board | Membres du board | Assignee OU Admin/Owner | Admin/Owner |
| board_engagements | Membres du board | Membres du board | Admin/Owner | - |
| board_subjects | Membres du board | Membres du board | Admin/Owner | - |

### Tables enfants

Les tables "enfants" (document_chunks, conversation_messages, meeting_*) passent par un JOIN sur leur table parente pour verifier l'appartenance au board.

---

## Protections des RPCs

| RPC | Protection |
|-----|-----------|
| accept_board_invitation | Verifie que l'email de l'invitation correspond a l'email de l'utilisateur connecte |
| remove_board_member | Verifie que l'appelant est admin/owner. Un admin ne peut pas supprimer un autre admin/owner. Impossible de supprimer le dernier owner |
| transfer_meeting_admin | Verifie que l'appelant est creator, admin_user_id, ou admin/owner du board. Le nouvel admin doit etre participant |

---

## Cotes serveur

- `getAuthenticatedUser()` dans `src/lib/supabase-server.ts` : verifie la session Supabase et retourne l'utilisateur ou throw une erreur
- Toutes les routes API utilisent `getAuthenticatedUser()` sauf `/api/live/webhook` (authentifie par Recall.ai)
- Les fonctions RPC sont `SECURITY DEFINER` avec `SET search_path = public` pour eviter les attaques par search_path
