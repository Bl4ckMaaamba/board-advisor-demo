-- Migration 020: Add category field to documents
-- Allows distinguishing agenda documents from regular board pack documents.
-- Values: NULL = regular document, 'agenda' = ordre du jour

ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- Index for fast filtering by meeting + category
CREATE INDEX IF NOT EXISTS idx_documents_meeting_category ON documents (meeting_id, category) WHERE meeting_id IS NOT NULL;
