-- Add speaker_name column to program_sessions
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS speaker_name TEXT;
