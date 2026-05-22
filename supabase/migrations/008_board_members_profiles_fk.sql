-- 008: Add FK from board_members.user_id to profiles.id
-- This enables PostgREST to detect the relationship for JOIN queries
-- like: select("*, profile:profiles(*)")

ALTER TABLE board_members
  ADD CONSTRAINT board_members_user_id_profiles_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
