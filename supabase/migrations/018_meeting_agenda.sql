-- Migration 018: Add agenda to meetings
-- Format: [{"order": 1, "title": "Bilan financier Q1", "duration_min": 30}, ...]

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS agenda JSONB DEFAULT '[]'::jsonb;
