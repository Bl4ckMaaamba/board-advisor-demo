-- Migration 021: Decisions captured during live meeting
--
-- This table stores decisions, actions and commitments captured manually
-- by the meeting host during a live session. It feeds generate-report.ts
-- which was already querying this table (silently failing because it didn't
-- exist yet).
--
-- Pattern aligned on 017_blind_spots.sql.
-- Idempotent: IF NOT EXISTS on all statements.

CREATE TABLE IF NOT EXISTS meeting_decisions_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

  -- Type of capture
  type TEXT NOT NULL CHECK (type IN ('decision', 'action', 'commitment')),

  -- Content
  content TEXT NOT NULL,

  -- Optional metadata
  speaker TEXT,
  assignee_name TEXT,
  deadline TEXT,
  context TEXT,
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: all queries filter by meeting_id
CREATE INDEX IF NOT EXISTS idx_decisions_pending_meeting ON meeting_decisions_pending(meeting_id);
CREATE INDEX IF NOT EXISTS idx_decisions_pending_created ON meeting_decisions_pending(created_at DESC);

-- RLS
ALTER TABLE meeting_decisions_pending ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_decisions_pending' AND policyname = 'Members can view decisions'
  ) THEN
    CREATE POLICY "Members can view decisions"
      ON meeting_decisions_pending FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM meetings m
        JOIN board_members bm ON bm.board_id = m.board_id
        WHERE m.id = meeting_decisions_pending.meeting_id
        AND bm.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_decisions_pending' AND policyname = 'Members can insert decisions'
  ) THEN
    CREATE POLICY "Members can insert decisions"
      ON meeting_decisions_pending FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM meetings m
        JOIN board_members bm ON bm.board_id = m.board_id
        WHERE m.id = meeting_decisions_pending.meeting_id
        AND bm.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_decisions_pending' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
      ON meeting_decisions_pending FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
