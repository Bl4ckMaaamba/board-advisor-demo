-- 010: Fix documents.meeting_id column type TEXT -> UUID with FK constraint
-- This ensures proper referential integrity between documents and meetings.

-- Step 1: Drop the old TEXT column
ALTER TABLE documents DROP COLUMN IF EXISTS meeting_id;

-- Step 2: Add as proper UUID with FK constraint
ALTER TABLE documents ADD COLUMN meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL;

-- Step 3: Index for query performance
CREATE INDEX IF NOT EXISTS idx_documents_meeting_id ON documents(meeting_id);

NOTIFY pgrst, 'reload schema';
