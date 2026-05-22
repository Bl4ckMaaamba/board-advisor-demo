-- ============================================================
-- Migration 011: Module Préparation — Profil Sectoriel + Mémoire Institutionnelle
-- Ajoute le profil d'entreprise enrichi sur boards,
-- et les tables de mémoire institutionnelle (décisions, actions, engagements, sujets)
-- ============================================================

-- ============================================================
-- 1. PROFIL SECTORIEL — Enrichir la table boards
-- ============================================================

-- Informations entreprise
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_siren TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_legal_form TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_headquarters TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_size TEXT CHECK (company_size IS NULL OR company_size IN ('startup', 'pme', 'eti', 'grande_entreprise'));
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_revenue TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_employees TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_geo_zones TEXT[];
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_listed BOOLEAN DEFAULT false;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS company_strategic_context TEXT CHECK (company_strategic_context IS NULL OR company_strategic_context IN ('croissance', 'pre_exit', 'post_acquisition', 'restructuration', 'stable', 'introduction_bourse'));

-- Concurrents et clients clés (JSONB pour flexibilité)
ALTER TABLE boards ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS key_clients JSONB DEFAULT '[]'::jsonb;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS tracked_kpis TEXT[];

-- Expertise des membres du board (stockée sur board_members)
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS expertise TEXT;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS bio TEXT;

-- ============================================================
-- 2. MÉMOIRE INSTITUTIONNELLE — Nouvelles tables
-- ============================================================

-- 2.1 Décisions de board
CREATE TABLE IF NOT EXISTS board_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  vote_result TEXT CHECK (vote_result IS NULL OR vote_result IN ('approved', 'rejected', 'deferred', 'unanimous', 'majority')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_decisions_board ON board_decisions(board_id);
CREATE INDEX idx_board_decisions_meeting ON board_decisions(meeting_id);
ALTER TABLE board_decisions ENABLE ROW LEVEL SECURITY;

-- 2.2 Actions (liées aux décisions)
CREATE TABLE IF NOT EXISTS board_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES board_decisions(id) ON DELETE SET NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  assignee_id UUID REFERENCES auth.users(id),
  assignee_name TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'overdue', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_actions_board ON board_actions(board_id);
CREATE INDEX idx_board_actions_decision ON board_actions(decision_id);
CREATE INDEX idx_board_actions_assignee ON board_actions(assignee_id);
CREATE INDEX idx_board_actions_status ON board_actions(status);
ALTER TABLE board_actions ENABLE ROW LEVEL SECURITY;

-- 2.3 Engagements (promesses verbales)
CREATE TABLE IF NOT EXISTS board_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  speaker_id UUID REFERENCES auth.users(id),
  speaker_name TEXT,
  description TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'broken', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_engagements_board ON board_engagements(board_id);
CREATE INDEX idx_board_engagements_meeting ON board_engagements(meeting_id);
ALTER TABLE board_engagements ENABLE ROW LEVEL SECURITY;

-- 2.4 Sujets traités
CREATE TABLE IF NOT EXISTS board_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  duration_minutes INT,
  decision_id UUID REFERENCES board_decisions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'discussed' CHECK (status IN ('discussed', 'deferred', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_subjects_board ON board_subjects(board_id);
CREATE INDEX idx_board_subjects_meeting ON board_subjects(meeting_id);
ALTER TABLE board_subjects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES — board-member-scoped
-- ============================================================

-- board_decisions
CREATE POLICY "Board members can view decisions"
  ON board_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_decisions.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert decisions"
  ON board_decisions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_decisions.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board admins can update decisions"
  ON board_decisions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_decisions.board_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Board admins can delete decisions"
  ON board_decisions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_decisions.board_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('owner', 'admin')
  ));

-- board_actions
CREATE POLICY "Board members can view actions"
  ON board_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_actions.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert actions"
  ON board_actions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_actions.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can update actions"
  ON board_actions FOR UPDATE
  USING (
    auth.uid() = assignee_id
    OR EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_actions.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Board admins can delete actions"
  ON board_actions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_actions.board_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('owner', 'admin')
  ));

-- board_engagements
CREATE POLICY "Board members can view engagements"
  ON board_engagements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_engagements.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert engagements"
  ON board_engagements FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_engagements.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board admins can update engagements"
  ON board_engagements FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_engagements.board_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('owner', 'admin')
  ));

-- board_subjects
CREATE POLICY "Board members can view subjects"
  ON board_subjects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_subjects.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board members can insert subjects"
  ON board_subjects FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_subjects.board_id
    AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Board admins can update subjects"
  ON board_subjects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_subjects.board_id
    AND bm.user_id = auth.uid()
    AND bm.role IN ('owner', 'admin')
  ));

-- ============================================================
-- 4. FUNCTION: Auto-mark overdue actions
-- ============================================================

CREATE OR REPLACE FUNCTION mark_overdue_actions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE board_actions
  SET status = 'overdue', updated_at = now()
  WHERE status IN ('todo', 'in_progress')
  AND deadline IS NOT NULL
  AND deadline < now();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_overdue_actions() TO authenticated;

-- ============================================================
-- 5. UPDATE my_boards VIEW to include new columns
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
  b.company_siren,
  b.company_legal_form,
  b.company_headquarters,
  b.company_size,
  b.company_revenue,
  b.company_employees,
  b.company_geo_zones,
  b.company_listed,
  b.company_strategic_context,
  b.competitors,
  b.key_clients,
  b.tracked_kpis,
  bm.role,
  bm.joined_at
FROM boards b
JOIN board_members bm ON bm.board_id = b.id
WHERE bm.user_id = auth.uid();
