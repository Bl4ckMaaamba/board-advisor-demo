-- Live Fact-Checking tables

CREATE TABLE meetings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id uuid,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','recording','paused','completed')),
  started_at timestamptz,
  ended_at timestamptz,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE meeting_transcriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  speaker text,
  content text NOT NULL,
  timestamp_start float8 NOT NULL,
  timestamp_end float8 NOT NULL,
  confidence float8,
  chunk_index int NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_mt_meeting ON meeting_transcriptions(meeting_id);

CREATE TABLE meeting_factchecks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  transcription_id uuid REFERENCES meeting_transcriptions(id),
  claim text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('true','false','unverifiable','partial','needs_context')),
  confidence float8 NOT NULL,
  explanation text,
  sources jsonb DEFAULT '[]',
  data_packets jsonb DEFAULT '[]',
  latency_ms int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_mf_meeting ON meeting_factchecks(meeting_id);

CREATE TABLE meeting_moderations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('tone','interruption','speaking_time','off_topic','conflict')),
  severity text NOT NULL CHECK (severity IN ('info','warning','alert')),
  message text NOT NULL,
  speaker text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_mm_meeting ON meeting_moderations(meeting_id);

CREATE TABLE meeting_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deep_dive','question','action_item','reference')),
  content text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  context text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_ms_meeting ON meeting_suggestions(meeting_id);

-- Enable Realtime for all live tables
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_transcriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_factchecks;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_moderations;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_suggestions;
