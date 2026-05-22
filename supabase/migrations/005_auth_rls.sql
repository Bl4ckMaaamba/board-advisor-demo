-- ============================================================
-- Migration 005: Authentication & Row-Level Security
-- Adds user_id columns, replaces permissive RLS with auth.uid() policies,
-- enables RLS on meeting tables, updates match_documents() for user filtering.
-- ============================================================

-- 1. Add user_id columns to parent tables (nullable for existing data)

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Indexes for query performance

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id);

-- 3. Drop existing permissive policies

DROP POLICY IF EXISTS "Allow all on documents" ON documents;
DROP POLICY IF EXISTS "Allow all on document_chunks" ON document_chunks;
DROP POLICY IF EXISTS "Allow all on conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all on conversation_messages" ON conversation_messages;

-- 4. Documents: user-scoped policies

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Document chunks: access via document ownership

CREATE POLICY "Users can view own document chunks"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own document chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own document chunks"
  ON document_chunks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own document chunks"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- 6. Conversations: user-scoped policies

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Conversation messages: access via conversation ownership

CREATE POLICY "Users can view own conversation messages"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own conversation messages"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- 8. Meetings: enable RLS and add user-scoped policies

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_factchecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_moderations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meetings"
  ON meetings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meetings"
  ON meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings"
  ON meetings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. Meeting child tables: access via meeting ownership

CREATE POLICY "Users can view own meeting transcriptions"
  ON meeting_transcriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_transcriptions.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own meeting transcriptions"
  ON meeting_transcriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_transcriptions.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own meeting factchecks"
  ON meeting_factchecks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_factchecks.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own meeting factchecks"
  ON meeting_factchecks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_factchecks.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own meeting moderations"
  ON meeting_moderations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_moderations.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own meeting moderations"
  ON meeting_moderations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_moderations.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own meeting suggestions"
  ON meeting_suggestions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_suggestions.meeting_id
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own meeting suggestions"
  ON meeting_suggestions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings
    WHERE meetings.id = meeting_suggestions.meeting_id
    AND meetings.user_id = auth.uid()
  ));

-- 10. Service-role bypass policies for live pipeline background writes
-- The service-role key bypasses RLS entirely, so no extra policies needed.

-- 11. Update match_documents() to filter by user_id
-- SECURITY DEFINER: runs as function owner (bypasses RLS), so we filter explicitly.

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.5,
  filter_board text DEFAULT null,
  filter_document_ids uuid[] DEFAULT null,
  filter_user_id uuid DEFAULT null
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
  section_title text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    d.name AS document_name,
    dc.content,
    dc.section_title,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND d.status = 'indexed'
    AND (filter_board IS NULL OR d.board = filter_board)
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
