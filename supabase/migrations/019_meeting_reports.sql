-- Migration 019: Meeting reports (auto-generated compte-rendu)

CREATE TABLE IF NOT EXISTS meeting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  agenda_used JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'generated', 'error'))
);

ALTER TABLE meeting_reports ENABLE ROW LEVEL SECURITY;

-- Board members can read reports for their boards
CREATE POLICY "board_members_read_reports" ON meeting_reports
  FOR SELECT USING (
    (board_id IS NULL AND EXISTS (
      SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.user_id = auth.uid()
    ))
    OR
    EXISTS (
      SELECT 1 FROM board_members bm WHERE bm.board_id = meeting_reports.board_id AND bm.user_id = auth.uid()
    )
  );

-- Only service role can insert/update (done server-side)
CREATE POLICY "service_role_write_reports" ON meeting_reports
  FOR ALL USING (auth.role() = 'service_role');
