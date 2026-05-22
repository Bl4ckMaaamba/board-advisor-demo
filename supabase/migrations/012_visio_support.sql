-- 012_visio_support.sql
-- Adds video conference support (Recall.ai) to meetings

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'in_person'
  CHECK (meeting_type IN ('in_person', 'visio'));
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recall_bot_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recall_bot_status TEXT
  CHECK (recall_bot_status IS NULL OR recall_bot_status IN ('joining', 'in_call', 'recording', 'done', 'error'));
