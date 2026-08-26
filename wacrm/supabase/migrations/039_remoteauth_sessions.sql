-- Add session_data to sessions for RemoteAuth ZIP payload storage
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_data TEXT;
