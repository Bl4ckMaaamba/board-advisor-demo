-- Migration 013_expert_panel.sql

-- Table des insights experts
CREATE TABLE meeting_expert_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  expert_id TEXT NOT NULL,
  expert_name TEXT NOT NULL,
  take TEXT NOT NULL,
  analysis TEXT NOT NULL,
  relevance_context TEXT,
  tags TEXT[] DEFAULT '{}',
  is_manual BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table de configuration expert par réunion
CREATE TABLE meeting_expert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  primary_expert_id TEXT NOT NULL,
  additional_expert_ids TEXT[] DEFAULT '{}',
  auto_selected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id)
);

-- Index
CREATE INDEX idx_expert_insights_meeting ON meeting_expert_insights(meeting_id);
CREATE INDEX idx_expert_insights_created ON meeting_expert_insights(created_at DESC);
CREATE INDEX idx_expert_config_meeting ON meeting_expert_config(meeting_id);

-- RLS
ALTER TABLE meeting_expert_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_expert_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view expert insights"
  ON meeting_expert_insights FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_expert_insights.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "System can insert expert insights"
  ON meeting_expert_insights FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_expert_insights.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Members can view expert config"
  ON meeting_expert_config FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_expert_config.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Admin can manage expert config"
  ON meeting_expert_config FOR ALL
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_expert_config.meeting_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('admin', 'owner')
  ));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_expert_insights;
