-- Migration 014: Fix RLS policies to allow meetings without a board_id
-- When a meeting is created standalone (no board selected), board_id = NULL.
-- The JOIN on board_members evaluates NULL = NULL as FALSE, blocking all access.
-- Fix: fall back to m.user_id = auth.uid() when board_id IS NULL.

-- ============================================================
-- meetings table
-- ============================================================

DROP POLICY IF EXISTS "Board members can view meetings" ON meetings;
CREATE POLICY "Board members can view meetings"
  ON meetings FOR SELECT
  USING (
    (board_id IS NULL AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = meetings.board_id
      AND board_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Board members can insert meetings" ON meetings;
CREATE POLICY "Board members can insert meetings"
  ON meetings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      board_id IS NULL
      OR EXISTS (
        SELECT 1 FROM board_members
        WHERE board_members.board_id = meetings.board_id
        AND board_members.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- meeting_transcriptions
-- ============================================================

DROP POLICY IF EXISTS "Board members can view meeting transcriptions" ON meeting_transcriptions;
CREATE POLICY "Board members can view meeting transcriptions"
  ON meeting_transcriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_transcriptions.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "Board members can insert meeting transcriptions" ON meeting_transcriptions;
CREATE POLICY "Board members can insert meeting transcriptions"
  ON meeting_transcriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_transcriptions.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

-- ============================================================
-- meeting_factchecks
-- ============================================================

DROP POLICY IF EXISTS "Board members can view meeting factchecks" ON meeting_factchecks;
CREATE POLICY "Board members can view meeting factchecks"
  ON meeting_factchecks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_factchecks.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "Board members can insert meeting factchecks" ON meeting_factchecks;
CREATE POLICY "Board members can insert meeting factchecks"
  ON meeting_factchecks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_factchecks.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

-- ============================================================
-- meeting_moderations
-- ============================================================

DROP POLICY IF EXISTS "Board members can view meeting moderations" ON meeting_moderations;
CREATE POLICY "Board members can view meeting moderations"
  ON meeting_moderations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_moderations.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "Board members can insert meeting moderations" ON meeting_moderations;
CREATE POLICY "Board members can insert meeting moderations"
  ON meeting_moderations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_moderations.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

-- ============================================================
-- meeting_suggestions
-- ============================================================

DROP POLICY IF EXISTS "Board members can view meeting suggestions" ON meeting_suggestions;
CREATE POLICY "Board members can view meeting suggestions"
  ON meeting_suggestions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_suggestions.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "Board members can insert meeting suggestions" ON meeting_suggestions;
CREATE POLICY "Board members can insert meeting suggestions"
  ON meeting_suggestions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_suggestions.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

-- ============================================================
-- meeting_expert_insights (from migration 013)
-- ============================================================

DROP POLICY IF EXISTS "Members can view expert insights" ON meeting_expert_insights;
CREATE POLICY "Members can view expert insights"
  ON meeting_expert_insights FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_expert_insights.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "System can insert expert insights" ON meeting_expert_insights;
CREATE POLICY "System can insert expert insights"
  ON meeting_expert_insights FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_expert_insights.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

-- ============================================================
-- meeting_expert_config (from migration 013)
-- ============================================================

DROP POLICY IF EXISTS "Members can view expert config" ON meeting_expert_config;
CREATE POLICY "Members can view expert config"
  ON meeting_expert_config FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_expert_config.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
      )
    )
  ));

DROP POLICY IF EXISTS "Admin can manage expert config" ON meeting_expert_config;
CREATE POLICY "Admin can manage expert config"
  ON meeting_expert_config FOR ALL
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_expert_config.meeting_id
    AND (
      (m.board_id IS NULL AND m.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = m.board_id AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
      )
    )
  ));
