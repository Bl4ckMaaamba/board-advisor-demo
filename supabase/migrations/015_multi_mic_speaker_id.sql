-- Migration 015: Multi-mic in-person — store speaker_user_id on transcriptions
-- Each participant connects their own mic; we tag every transcription segment
-- with the user_id of the speaker so analytics, expert pipelines and per-speaker
-- stats can resolve the real identity instead of relying on free-text speaker labels.

-- speaker (text) keeps the human-readable display name for the UI.
-- speaker_user_id is the canonical FK; nullable so legacy rows + visio (where
-- Recall.ai gives names but no auth user) keep working.

ALTER TABLE meeting_transcriptions
  ADD COLUMN IF NOT EXISTS speaker_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_transcriptions_speaker_user
  ON meeting_transcriptions (meeting_id, speaker_user_id)
  WHERE speaker_user_id IS NOT NULL;
