-- Migration 017: Blind Spots (angles morts) — 5e pipeline live
--
-- Spec: specs/features/blind-spots.md
--
-- Le pipeline détecte ce qui n'est PAS dit en réunion alors que ça mériterait
-- de l'être. 3 types de sources : documents du board (RAG), mémoire institutionnelle,
-- signaux externes (Data Broker).
--
-- Pattern aligné sur la migration 013_expert_panel.sql.

CREATE TABLE meeting_blind_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

  -- Contenu
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommended_action TEXT,

  -- Classification
  type TEXT NOT NULL CHECK (type IN ('docs', 'memory', 'external')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info')),
  domain TEXT CHECK (domain IS NULL OR domain IN ('finance', 'strategie', 'juridique', 'operations', 'rh', 'esg', 'tech')),

  -- Source polymorphe selon type
  -- 'document'       : { document_id, document_name, chunk_id, section_title, excerpt }
  -- 'meeting_history': { meeting_id, meeting_date, transcript_excerpt, decision_id? }
  -- 'web'            : { url, title, published_at?, provider }
  source_type TEXT NOT NULL CHECK (source_type IN ('document', 'meeting_history', 'decision', 'web', 'api')),
  source_reference JSONB NOT NULL,

  -- Métadonnées de génération
  is_manual BOOLEAN NOT NULL DEFAULT false,
  triggered_by_user_id UUID REFERENCES auth.users(id),
  trigger_query TEXT,
  relevance_score NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices (alignés sur 013_expert_panel.sql)
CREATE INDEX idx_blind_spots_meeting ON meeting_blind_spots(meeting_id);
CREATE INDEX idx_blind_spots_created ON meeting_blind_spots(created_at DESC);
CREATE INDEX idx_blind_spots_type ON meeting_blind_spots(meeting_id, type);
CREATE INDEX idx_blind_spots_severity ON meeting_blind_spots(meeting_id, severity);

-- RLS
ALTER TABLE meeting_blind_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view blind spots"
  ON meeting_blind_spots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_blind_spots.meeting_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Members can insert blind spots"
  ON meeting_blind_spots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN board_members bm ON bm.board_id = m.board_id
    WHERE m.id = meeting_blind_spots.meeting_id
    AND bm.user_id = auth.uid()
  ));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_blind_spots;
