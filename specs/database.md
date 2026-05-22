# Board Advisor — Schema Base de Donnees

> Derniere mise a jour : 21 mars 2026
> Source : migrations 002 a 012 dans `supabase/migrations/`

---

## Tables

### profiles

Auto-creee par trigger a l'inscription.

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK, FK → auth.users(id) ON DELETE CASCADE |
| email | TEXT | NOT NULL |
| full_name | TEXT | |
| avatar_url | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### boards

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| description | TEXT | |
| sector | TEXT | |
| owner_id | UUID | NOT NULL, FK → auth.users(id) |
| company_siren | TEXT | |
| company_legal_form | TEXT | |
| company_headquarters | TEXT | |
| company_size | TEXT | CHECK (startup, pme, eti, grande_entreprise) |
| company_revenue | TEXT | |
| company_employees | TEXT | |
| company_geo_zones | TEXT[] | |
| company_listed | BOOLEAN | DEFAULT false |
| company_strategic_context | TEXT | CHECK (croissance, pre_exit, post_acquisition, restructuration, stable, introduction_bourse) |
| competitors | JSONB | DEFAULT '[]' |
| key_clients | JSONB | DEFAULT '[]' |
| tracked_kpis | TEXT[] | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### board_members

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| role | TEXT | NOT NULL, DEFAULT 'member', CHECK (owner, admin, member) |
| expertise | TEXT | |
| bio | TEXT | |
| joined_at | TIMESTAMPTZ | DEFAULT now() |

UNIQUE(board_id, user_id)

### board_invitations

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| email | TEXT | NOT NULL |
| role | TEXT | NOT NULL, DEFAULT 'member', CHECK (admin, member) |
| token | UUID | NOT NULL, UNIQUE, DEFAULT gen_random_uuid() |
| invited_by | UUID | NOT NULL, FK → auth.users(id) |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK (pending, accepted, expired) |
| expires_at | TIMESTAMPTZ | DEFAULT now() + 7 days |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### documents

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | FK → boards(id) |
| user_id | UUID | |
| name | TEXT | |
| type | TEXT | |
| size | INT | |
| status | TEXT | (uploaded, indexed) |
| meeting_id | UUID | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### document_chunks

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| document_id | UUID | FK → documents(id) ON DELETE CASCADE |
| content | TEXT | |
| section_title | TEXT | |
| embedding | vector(1024) | Voyage 4 embeddings |
| chunk_index | INT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### conversations

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | FK → boards(id) |
| user_id | UUID | |
| title | TEXT | DEFAULT 'Nouvelle conversation' |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### conversation_messages

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE |
| role | TEXT | NOT NULL, CHECK (user, assistant) |
| content | TEXT | NOT NULL |
| sources | JSONB | DEFAULT '[]' |
| tools_used | TEXT[] | DEFAULT '{}' |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### meetings

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | FK → boards(id) ON DELETE SET NULL |
| user_id | UUID | |
| admin_user_id | UUID | FK → auth.users(id) |
| title | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'idle', CHECK (idle, recording, paused, completed) |
| scheduled_at | TIMESTAMPTZ | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |
| config | JSONB | DEFAULT '{}' |
| meeting_type | TEXT | DEFAULT 'in_person', CHECK (in_person, visio) |
| meeting_url | TEXT | Lien Zoom/Meet/Teams |
| recall_bot_id | TEXT | ID du bot Recall.ai |
| recall_bot_status | TEXT | CHECK (joining, in_call, recording, done, error) |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### meeting_participants

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| meeting_id | UUID | NOT NULL, FK → meetings(id) ON DELETE CASCADE |
| user_id | UUID | FK → auth.users(id) ON DELETE SET NULL |
| email | TEXT | NOT NULL |
| role | TEXT | NOT NULL, DEFAULT 'member', CHECK (admin, member, observer) |
| type | TEXT | NOT NULL, DEFAULT 'permanent', CHECK (permanent, exceptional) |
| status | TEXT | NOT NULL, DEFAULT 'invited', CHECK (invited, confirmed, declined) |
| created_at | TIMESTAMPTZ | DEFAULT now() |

UNIQUE(meeting_id, email)

### meeting_transcriptions

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| meeting_id | UUID | FK → meetings(id) ON DELETE CASCADE |
| speaker | TEXT | |
| content | TEXT | NOT NULL |
| timestamp_start | FLOAT8 | NOT NULL |
| timestamp_end | FLOAT8 | NOT NULL |
| confidence | FLOAT8 | |
| chunk_index | INT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Realtime active.

### meeting_factchecks

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| meeting_id | UUID | FK → meetings(id) ON DELETE CASCADE |
| transcription_id | UUID | FK → meeting_transcriptions(id) |
| claim | TEXT | NOT NULL |
| verdict | TEXT | NOT NULL, CHECK (true, false, unverifiable, partial, needs_context) |
| confidence | FLOAT8 | NOT NULL |
| explanation | TEXT | |
| sources | JSONB | DEFAULT '[]' |
| data_packets | JSONB | DEFAULT '[]' |
| latency_ms | INT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Realtime active.

### meeting_moderations

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| meeting_id | UUID | FK → meetings(id) ON DELETE CASCADE |
| type | TEXT | NOT NULL, CHECK (tone, interruption, speaking_time, off_topic, conflict) |
| severity | TEXT | NOT NULL, CHECK (info, warning, alert) |
| message | TEXT | NOT NULL |
| speaker | TEXT | |
| details | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Realtime active.

### meeting_suggestions

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| meeting_id | UUID | FK → meetings(id) ON DELETE CASCADE |
| type | TEXT | NOT NULL, CHECK (deep_dive, question, action_item, reference) |
| content | TEXT | NOT NULL |
| priority | TEXT | DEFAULT 'medium', CHECK (low, medium, high) |
| context | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Realtime active.

### board_decisions (memoire institutionnelle)

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| meeting_id | UUID | FK → meetings(id) ON DELETE SET NULL |
| subject | TEXT | NOT NULL |
| description | TEXT | |
| vote_result | TEXT | CHECK (approved, rejected, deferred, unanimous, majority) |
| status | TEXT | NOT NULL, DEFAULT 'active', CHECK (active, superseded, revoked) |
| created_by | UUID | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### board_actions (memoire institutionnelle)

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| decision_id | UUID | FK → board_decisions(id) ON DELETE SET NULL |
| meeting_id | UUID | FK → meetings(id) ON DELETE SET NULL |
| description | TEXT | NOT NULL |
| assignee_id | UUID | FK → auth.users(id) |
| assignee_name | TEXT | |
| deadline | TIMESTAMPTZ | |
| status | TEXT | NOT NULL, DEFAULT 'todo', CHECK (todo, in_progress, done, overdue, cancelled) |
| priority | TEXT | DEFAULT 'medium', CHECK (low, medium, high, critical) |
| notes | TEXT | |
| completed_at | TIMESTAMPTZ | |
| created_by | UUID | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### board_engagements (memoire institutionnelle)

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| meeting_id | UUID | FK → meetings(id) ON DELETE SET NULL |
| speaker_id | UUID | FK → auth.users(id) |
| speaker_name | TEXT | |
| description | TEXT | NOT NULL |
| context | TEXT | |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK (pending, fulfilled, broken, expired) |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### board_subjects (memoire institutionnelle)

| Colonne | Type | Contrainte |
|---------|------|-----------|
| id | UUID | PK |
| board_id | UUID | NOT NULL, FK → boards(id) ON DELETE CASCADE |
| meeting_id | UUID | FK → meetings(id) ON DELETE SET NULL |
| title | TEXT | NOT NULL |
| summary | TEXT | |
| duration_minutes | INT | |
| decision_id | UUID | FK → board_decisions(id) ON DELETE SET NULL |
| status | TEXT | NOT NULL, DEFAULT 'discussed', CHECK (discussed, deferred, resolved) |
| created_at | TIMESTAMPTZ | DEFAULT now() |

---

## Vue

### my_boards

```sql
SELECT b.*, bm.role, bm.joined_at
FROM boards b
JOIN board_members bm ON bm.board_id = b.id
WHERE bm.user_id = auth.uid();
```

Inclut les colonnes de profil sectoriel (company_siren, etc.).

---

## Triggers

| Trigger | Table | Fonction | Role |
|---------|-------|----------|------|
| on_auth_user_created | auth.users | handle_new_user() | Cree une ligne dans profiles a l'inscription |
| on_board_created | boards | auto_add_board_owner() | Ajoute le createur comme owner dans board_members |
| on_meeting_created | meetings | auto_populate_meeting_participants() | Peuple les participants depuis les board_members |

---

## Fonctions RPC

| Fonction | Parametres | Role |
|----------|-----------|------|
| accept_board_invitation | (invitation_token UUID) | Accepte une invitation (verifie email, ajoute comme membre) |
| remove_board_member | (target_board_id UUID, target_user_id UUID) | Supprime un membre (protege le dernier owner) |
| transfer_meeting_admin | (target_meeting_id UUID, new_admin_user_id UUID) | Transfere l'admin d'une reunion |
| match_documents | (query_embedding, match_count, match_threshold, filter_board_id, filter_document_ids, filter_user_id) | Recherche semantique pgvector |
| mark_overdue_actions | () | Marque les actions en retard |

---

## Migrations

| # | Fichier | Contenu |
|---|---------|---------|
| 002 | 002_live_factcheck.sql | Tables meetings, transcriptions, factchecks, moderations, suggestions + Realtime |
| 003 | 003_conversations.sql | Tables conversations + messages |
| 004 | 004_document_filter.sql | Filtre de documents |
| 005 | 005_auth_rls.sql | RLS initiales user-scoped (supersede par 006) |
| 006 | 006_boards_members.sql | Systeme multi-membres complet (profiles, boards, board_members, invitations, participants, RLS board-scoped, triggers, RPCs) |
| 007 | 007_fix_rls_and_profiles.sql | Corrections RLS et profiles |
| 008 | 008_board_members_profiles_fk.sql | FK board_members → profiles |
| 009 | 009_meetings_scheduled_at.sql | Ajout scheduled_at aux meetings |
| 010 | 010_documents_meeting_id_uuid.sql | meeting_id en UUID sur documents |
| 011 | 011_preparation_memory.sql | Profil sectoriel (boards) + memoire institutionnelle (decisions, actions, engagements, sujets) + RLS |
| 012 | 012_visio_support.sql | Support visio (meeting_url, meeting_type, recall_bot_id, recall_bot_status) |

---

## Realtime

Les tables suivantes sont ajoutees a `supabase_realtime` publication :
- meeting_transcriptions
- meeting_factchecks
- meeting_moderations
- meeting_suggestions
