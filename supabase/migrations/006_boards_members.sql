-- ============================================================
-- Migration 006: Multi-Member Board System
-- Creates profiles, boards, board_members, board_invitations,
-- meeting_participants. Migrates documents.board TEXT -> board_id UUID,
-- conversations.board_id TEXT -> UUID. Rewrites all RLS to board-member-scoped.
-- ============================================================

-- ============================================================
-- 0. TRUNCATE TEST DATA (safe: only test data exists)
-- ============================================================

TRUNCATE TABLE meeting_suggestions CASCADE;
TRUNCATE TABLE meeting_moderations CASCADE;
TRUNCATE TABLE meeting_factchecks CASCADE;
TRUNCATE TABLE meeting_transcriptions CASCADE;
TRUNCATE TABLE conversation_messages CASCADE;
TRUNCATE TABLE conversations CASCADE;
TRUNCATE TABLE document_chunks CASCADE;
TRUNCATE TABLE documents CASCADE;
TRUNCATE TABLE meetings CASCADE;

-- ============================================================
-- 1. NEW TABLES
-- ============================================================

-- 1.1 Profiles (auto-created on signup via trigger)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1.2 Boards
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sector TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- 1.3 Board Members (pivot table)
CREATE TABLE board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX idx_board_members_board ON board_members(board_id);
CREATE INDEX idx_board_members_user ON board_members(user_id);

ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;

-- 1.4 Board Invitations
CREATE TABLE board_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_invitations_token ON board_invitations(token);
CREATE INDEX idx_board_invitations_email ON board_invitations(email);

ALTER TABLE board_invitations ENABLE ROW LEVEL SECURITY;

-- 1.5 Meeting Participants
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'observer')),
  type TEXT NOT NULL DEFAULT 'permanent' CHECK (type IN ('permanent', 'exceptional')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, email)
);

CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user ON meeting_participants(user_id);

ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. MODIFY EXISTING COLUMNS
-- ============================================================

-- 2.1 documents: board TEXT -> board_id UUID
ALTER TABLE documents DROP COLUMN IF EXISTS board;
ALTER TABLE documents ADD COLUMN board_id UUID REFERENCES boards(id);
CREATE INDEX idx_documents_board_id ON documents(board_id);

-- 2.2 conversations: board_id TEXT -> board_id UUID
ALTER TABLE conversations DROP COLUMN IF EXISTS board_id;
ALTER TABLE conversations ADD COLUMN board_id UUID REFERENCES boards(id);
CREATE INDEX idx_conversations_board_id ON conversations(board_id);

-- 2.3 meetings: add FK constraint on board_id (column exists but no FK)
ALTER TABLE meetings ADD CONSTRAINT meetings_board_id_fk
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_board_id ON meetings(board_id);

-- 2.4 meetings: add admin_user_id for meeting admin delegation
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id);

-- ============================================================
-- 3. DROP ALL OLD RLS POLICIES
-- ============================================================

-- From migration 005 (user-scoped)
DROP POLICY IF EXISTS "Users can view own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

DROP POLICY IF EXISTS "Users can view own document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can insert own document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can update own document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete own document chunks" ON document_chunks;

DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view own conversation messages" ON conversation_messages;
DROP POLICY IF EXISTS "Users can insert own conversation messages" ON conversation_messages;

DROP POLICY IF EXISTS "Users can view own meetings" ON meetings;
DROP POLICY IF EXISTS "Users can insert own meetings" ON meetings;
DROP POLICY IF EXISTS "Users can update own meetings" ON meetings;

DROP POLICY IF EXISTS "Users can view own meeting transcriptions" ON meeting_transcriptions;
DROP POLICY IF EXISTS "Users can insert own meeting transcriptions" ON meeting_transcriptions;

DROP POLICY IF EXISTS "Users can view own meeting factchecks" ON meeting_factchecks;
DROP POLICY IF EXISTS "Users can insert own meeting factchecks" ON meeting_factchecks;

DROP POLICY IF EXISTS "Users can view own meeting moderations" ON meeting_moderations;
DROP POLICY IF EXISTS "Users can insert own meeting moderations" ON meeting_moderations;

DROP POLICY IF EXISTS "Users can view own meeting suggestions" ON meeting_suggestions;
DROP POLICY IF EXISTS "Users can insert own meeting suggestions" ON meeting_suggestions;

-- ============================================================
-- 4. NEW RLS POLICIES (board-member-scoped)
-- ============================================================

-- 4.1 Profiles
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 4.2 Boards
CREATE POLICY "Board members can view boards"
  ON boards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = boards.id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Auth users can create boards"
  ON boards FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Board admins can update boards"
  ON boards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = boards.id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Board owner can delete boards"
  ON boards FOR DELETE
  USING (auth.uid() = owner_id);

-- 4.3 Board Members
CREATE POLICY "Board members can view members"
  ON board_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Board admins can manage members"
  ON board_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Board admins can update members"
  ON board_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Board admins can remove members"
  ON board_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

-- 4.4 Board Invitations
CREATE POLICY "Board admins can view invitations"
  ON board_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = board_invitations.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
    OR board_invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Board admins can create invitations"
  ON board_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = board_invitations.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Board admins can update invitations"
  ON board_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = board_invitations.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
    OR board_invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 4.5 Documents (board-member-scoped)
CREATE POLICY "Board members can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = documents.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can insert documents"
  ON documents FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = documents.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = documents.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can delete documents"
  ON documents FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = documents.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
  );

-- 4.6 Document Chunks (via document -> board)
CREATE POLICY "Board members can view document chunks"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN board_members bm ON bm.board_id = d.board_id
      WHERE d.id = document_chunks.document_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can insert document chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN board_members bm ON bm.board_id = d.board_id
      WHERE d.id = document_chunks.document_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can update document chunks"
  ON document_chunks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN board_members bm ON bm.board_id = d.board_id
      WHERE d.id = document_chunks.document_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can delete document chunks"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN board_members bm ON bm.board_id = d.board_id
      WHERE d.id = document_chunks.document_id
      AND bm.user_id = auth.uid()
    )
  );

-- 4.7 Conversations (board-member-scoped + owner)
CREATE POLICY "Users can view own or board conversations"
  ON conversations FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = conversations.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- 4.8 Conversation Messages (via conversation)
CREATE POLICY "Users can view conversation messages"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = c.board_id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert conversation messages"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
      AND c.user_id = auth.uid()
    )
  );

-- 4.9 Meetings (board-member-scoped)
CREATE POLICY "Board members can view meetings"
  ON meetings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = meetings.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Board members can insert meetings"
  ON meetings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = meetings.board_id
      AND board_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Board admins can update meetings"
  ON meetings FOR UPDATE
  USING (
    auth.uid() = user_id
    OR auth.uid() = admin_user_id
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = meetings.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('owner', 'admin')
    )
  );

-- 4.10 Meeting child tables (via meeting -> board)
CREATE POLICY "Board members can view meeting transcriptions"
  ON meeting_transcriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_transcriptions.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert meeting transcriptions"
  ON meeting_transcriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_transcriptions.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can view meeting factchecks"
  ON meeting_factchecks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_factchecks.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert meeting factchecks"
  ON meeting_factchecks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_factchecks.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can view meeting moderations"
  ON meeting_moderations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_moderations.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert meeting moderations"
  ON meeting_moderations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_moderations.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can view meeting suggestions"
  ON meeting_suggestions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_suggestions.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert meeting suggestions"
  ON meeting_suggestions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_suggestions.meeting_id
    AND bm.user_id = auth.uid()
  ));

-- 4.11 Meeting Participants
CREATE POLICY "Board members can view meeting participants"
  ON meeting_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN board_members bm ON bm.board_id = m.board_id
      WHERE m.id = meeting_participants.meeting_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Meeting admins can manage participants"
  ON meeting_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND (
        m.user_id = auth.uid()
        OR m.admin_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = m.board_id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('owner', 'admin')
        )
      )
    )
  );

CREATE POLICY "Meeting admins can update participants"
  ON meeting_participants FOR UPDATE
  USING (
    meeting_participants.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND (
        m.user_id = auth.uid()
        OR m.admin_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Meeting admins can remove participants"
  ON meeting_participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND (
        m.user_id = auth.uid()
        OR m.admin_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = m.board_id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('owner', 'admin')
        )
      )
    )
  );

-- ============================================================
-- 5. UPDATED match_documents() FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.5,
  filter_board_id uuid DEFAULT null,
  filter_document_ids uuid[] DEFAULT null,
  filter_user_id uuid DEFAULT null
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
  section_title text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    d.name AS document_name,
    dc.content,
    dc.section_title,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND d.status = 'indexed'
    AND (filter_board_id IS NULL OR d.board_id = filter_board_id)
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 6. TRIGGERS & FUNCTIONS
-- ============================================================

-- 6.1 Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 6.2 Auto-add board owner as board_member
CREATE OR REPLACE FUNCTION auto_add_board_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO board_members (board_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_board_created ON boards;
CREATE TRIGGER on_board_created
  AFTER INSERT ON boards
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_board_owner();

-- 6.3 Auto-populate meeting participants from board members
CREATE OR REPLACE FUNCTION auto_populate_meeting_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO meeting_participants (meeting_id, user_id, email, role, type, status)
  SELECT
    NEW.id,
    bm.user_id,
    p.email,
    CASE WHEN bm.user_id = NEW.user_id THEN 'admin' ELSE 'member' END,
    'permanent',
    CASE WHEN bm.user_id = NEW.user_id THEN 'confirmed' ELSE 'invited' END
  FROM board_members bm
  JOIN profiles p ON p.id = bm.user_id
  WHERE bm.board_id = NEW.board_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_meeting_created ON meetings;
CREATE TRIGGER on_meeting_created
  AFTER INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_meeting_participants();

-- ============================================================
-- 7. RPC FUNCTIONS
-- ============================================================

-- 7.1 Accept board invitation
CREATE OR REPLACE FUNCTION accept_board_invitation(invitation_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  current_user_email TEXT;
BEGIN
  -- Get current user email
  SELECT email INTO current_user_email FROM auth.users WHERE id = auth.uid();

  -- Find invitation
  SELECT * INTO inv FROM board_invitations
  WHERE token = invitation_token
  AND status = 'pending'
  AND expires_at > now();

  IF inv IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation invalide ou expiree');
  END IF;

  -- Verify email matches
  IF inv.email != current_user_email THEN
    RETURN json_build_object('success', false, 'error', 'Cette invitation ne correspond pas a votre email');
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM board_members WHERE board_id = inv.board_id AND user_id = auth.uid()) THEN
    -- Update invitation status anyway
    UPDATE board_invitations SET status = 'accepted' WHERE id = inv.id;
    RETURN json_build_object('success', true, 'board_id', inv.board_id, 'already_member', true);
  END IF;

  -- Add as member
  INSERT INTO board_members (board_id, user_id, role)
  VALUES (inv.board_id, auth.uid(), inv.role);

  -- Mark invitation accepted
  UPDATE board_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN json_build_object('success', true, 'board_id', inv.board_id, 'role', inv.role);
END;
$$;

-- 7.2 Remove board member (admin/owner only, cannot remove last owner)
CREATE OR REPLACE FUNCTION remove_board_member(target_board_id UUID, target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  target_role TEXT;
  owner_count INT;
BEGIN
  -- Check caller is admin/owner
  SELECT role INTO caller_role FROM board_members
  WHERE board_id = target_board_id AND user_id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Droits insuffisants');
  END IF;

  -- Get target role
  SELECT role INTO target_role FROM board_members
  WHERE board_id = target_board_id AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Membre non trouve');
  END IF;

  -- Cannot remove owner unless there are other owners
  IF target_role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count FROM board_members
    WHERE board_id = target_board_id AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN json_build_object('success', false, 'error', 'Impossible de supprimer le dernier proprietaire');
    END IF;
  END IF;

  -- Admin cannot remove other admins/owners
  IF caller_role = 'admin' AND target_role IN ('owner', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Un admin ne peut pas supprimer un autre admin ou proprietaire');
  END IF;

  DELETE FROM board_members
  WHERE board_id = target_board_id AND user_id = target_user_id;

  RETURN json_build_object('success', true);
END;
$$;

-- 7.3 Transfer meeting admin
CREATE OR REPLACE FUNCTION transfer_meeting_admin(target_meeting_id UUID, new_admin_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting_rec RECORD;
BEGIN
  SELECT * INTO meeting_rec FROM meetings WHERE id = target_meeting_id;

  IF meeting_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Reunion non trouvee');
  END IF;

  -- Only current admin/creator or board admin can transfer
  IF meeting_rec.user_id != auth.uid() AND meeting_rec.admin_user_id != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM board_members
      WHERE board_id = meeting_rec.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Droits insuffisants');
    END IF;
  END IF;

  -- Verify new admin is a participant
  IF NOT EXISTS (
    SELECT 1 FROM meeting_participants
    WHERE meeting_id = target_meeting_id AND user_id = new_admin_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Le nouvel admin doit etre participant');
  END IF;

  -- Update meeting admin
  UPDATE meetings SET admin_user_id = new_admin_user_id WHERE id = target_meeting_id;

  -- Update participant roles
  UPDATE meeting_participants SET role = 'member'
  WHERE meeting_id = target_meeting_id AND role = 'admin';

  UPDATE meeting_participants SET role = 'admin'
  WHERE meeting_id = target_meeting_id AND user_id = new_admin_user_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- 8. CONVENIENCE VIEW
-- ============================================================

CREATE OR REPLACE VIEW my_boards AS
SELECT
  b.id,
  b.name,
  b.description,
  b.sector,
  b.owner_id,
  b.created_at,
  b.updated_at,
  bm.role,
  bm.joined_at
FROM boards b
JOIN board_members bm ON bm.board_id = b.id
WHERE bm.user_id = auth.uid();

-- ============================================================
-- 9. GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION accept_board_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_board_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_meeting_admin(UUID, UUID) TO authenticated;
