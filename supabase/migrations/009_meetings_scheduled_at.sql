-- 009: Add scheduled_at column to meetings for planned meeting dates
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
