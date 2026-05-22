-- ============================================================
-- Migration 007: Fix RLS infinite recursion + backfill profiles
-- Root cause: board_members SELECT policy referenced itself,
-- causing infinite recursion in all policies that read board_members.
-- Fix: SECURITY DEFINER helper functions that bypass RLS.
-- ============================================================

-- 1. Helper functions (SECURITY DEFINER = bypass RLS, no recursion)

CREATE OR REPLACE FUNCTION is_board_member(check_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = check_board_id
    AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_board_admin(check_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = check_board_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION is_board_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_board_admin(UUID) TO authenticated;

-- 2. Fix board_members policies (was self-referencing = infinite recursion)

DROP POLICY IF EXISTS "Board members can view members" ON board_members;
CREATE POLICY "Board members can view members"
  ON board_members FOR SELECT
  USING (is_board_member(board_id));

DROP POLICY IF EXISTS "Board admins can manage members" ON board_members;
CREATE POLICY "Board admins can manage members"
  ON board_members FOR INSERT
  WITH CHECK (is_board_admin(board_id));

DROP POLICY IF EXISTS "Board admins can update members" ON board_members;
CREATE POLICY "Board admins can update members"
  ON board_members FOR UPDATE
  USING (is_board_admin(board_id));

DROP POLICY IF EXISTS "Board admins can remove members" ON board_members;
CREATE POLICY "Board admins can remove members"
  ON board_members FOR DELETE
  USING (is_board_admin(board_id));

-- 3. Fix boards SELECT (add owner_id fallback for post-INSERT visibility)

DROP POLICY IF EXISTS "Board members can view boards" ON boards;
CREATE POLICY "Board members can view boards"
  ON boards FOR SELECT
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = boards.id
      AND board_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Board admins can update boards" ON boards;
CREATE POLICY "Board admins can update boards"
  ON boards FOR UPDATE
  USING (is_board_admin(id));

-- 4. Fix documents policies (add user_id ownership fallback)

DROP POLICY IF EXISTS "Board members can view documents" ON documents;
CREATE POLICY "Board members can view documents"
  ON documents FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = documents.board_id
      AND board_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Board members can insert documents" ON documents;
CREATE POLICY "Board members can insert documents"
  ON documents FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      documents.board_id IS NULL
      OR EXISTS (
        SELECT 1 FROM board_members
        WHERE board_members.board_id = documents.board_id
        AND board_members.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Board members can update documents" ON documents;
CREATE POLICY "Board members can update documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id OR is_board_member(board_id));

DROP POLICY IF EXISTS "Board members can delete documents" ON documents;
CREATE POLICY "Board members can delete documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id OR is_board_admin(board_id));

-- 5. Fix document_chunks (add user_id ownership path)

DROP POLICY IF EXISTS "Board members can view document chunks" ON document_chunks;
CREATE POLICY "Board members can view document chunks"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_chunks.document_id
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = d.board_id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Board members can insert document chunks" ON document_chunks;
CREATE POLICY "Board members can insert document chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_chunks.document_id
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_members bm
          WHERE bm.board_id = d.board_id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

-- 6. Fix board_invitations

-- NOTE: auth.jwt() ->> 'email' is used instead of SELECT from auth.users
-- because the authenticated role cannot read auth.users directly (42501).

DROP POLICY IF EXISTS "Board admins can view invitations" ON board_invitations;
CREATE POLICY "Board admins can view invitations"
  ON board_invitations FOR SELECT
  USING (
    is_board_admin(board_id)
    OR email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Board admins can create invitations" ON board_invitations;
CREATE POLICY "Board admins can create invitations"
  ON board_invitations FOR INSERT
  WITH CHECK (is_board_admin(board_id));

DROP POLICY IF EXISTS "Board admins can update invitations" ON board_invitations;
CREATE POLICY "Board admins can update invitations"
  ON board_invitations FOR UPDATE
  USING (
    is_board_admin(board_id)
    OR email = (auth.jwt() ->> 'email')
  );

-- 7. Fix meetings

DROP POLICY IF EXISTS "Board members can view meetings" ON meetings;
CREATE POLICY "Board members can view meetings"
  ON meetings FOR SELECT
  USING (is_board_member(board_id));

DROP POLICY IF EXISTS "Board members can insert meetings" ON meetings;
CREATE POLICY "Board members can insert meetings"
  ON meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_board_member(board_id));

DROP POLICY IF EXISTS "Board admins can update meetings" ON meetings;
CREATE POLICY "Board admins can update meetings"
  ON meetings FOR UPDATE
  USING (
    auth.uid() = user_id
    OR auth.uid() = admin_user_id
    OR is_board_admin(board_id)
  );

-- 8. Backfill profiles for pre-migration users

INSERT INTO profiles (id, email, full_name, avatar_url)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
);

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
