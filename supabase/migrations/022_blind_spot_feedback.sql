-- Migration 022: Feedback utilisateur sur les blind spots (thumbs up/down)
--
-- Permet aux membres de noter la pertinence des angles morts.
-- Un seul vote par user par blind spot (upsert).
-- Les votes influencent le dédup futur (downvoté = ne pas dédupliquer).

CREATE TABLE IF NOT EXISTS blind_spot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blind_spot_id UUID NOT NULL REFERENCES meeting_blind_spots(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blind_spot_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blind_spot_feedback_spot ON blind_spot_feedback(blind_spot_id);
CREATE INDEX IF NOT EXISTS idx_blind_spot_feedback_meeting ON blind_spot_feedback(meeting_id);

ALTER TABLE blind_spot_feedback ENABLE ROW LEVEL SECURITY;

-- Members can read feedback for blind spots in their board's meetings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'blind_spot_feedback' AND policyname = 'Members can view feedback'
  ) THEN
    CREATE POLICY "Members can view feedback"
      ON blind_spot_feedback FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM meetings m
        JOIN board_members bm ON bm.board_id = m.board_id
        WHERE m.id = blind_spot_feedback.meeting_id
        AND bm.user_id = auth.uid()
      ));
  END IF;

  -- Users can insert/update their own feedback
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'blind_spot_feedback' AND policyname = 'Users can upsert own feedback'
  ) THEN
    CREATE POLICY "Users can upsert own feedback"
      ON blind_spot_feedback FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM meetings m
          JOIN board_members bm ON bm.board_id = m.board_id
          WHERE m.id = blind_spot_feedback.meeting_id
          AND bm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'blind_spot_feedback' AND policyname = 'Users can update own feedback'
  ) THEN
    CREATE POLICY "Users can update own feedback"
      ON blind_spot_feedback FOR UPDATE
      USING (user_id = auth.uid());
  END IF;
END $$;
