-- Migration: Sessions QR Code, Realtime, Send Queue Index & Rate-Limit RPC
-- Description: Adds qr_code column to sessions, enables Realtime for sessions,
--              adds an index on send_queue.account_id for RLS performance,
--              and creates an increment_daily_count RPC for atomic rate-limit counting.

-- 1. Add qr_code column to sessions for storing QR data during pairing
ALTER TABLE sessions
ADD COLUMN qr_code TEXT;

-- 2. Convert session_data from TEXT to JSONB so the client auto-parses it
ALTER TABLE sessions
ALTER COLUMN session_data TYPE JSONB USING COALESCE(session_data::jsonb, '{}'::jsonb),
ALTER COLUMN session_data SET DEFAULT '{}'::jsonb;

-- 3. Add sessions to supabase_realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;

-- 4. Index on send_queue.account_id for RLS performance
CREATE INDEX IF NOT EXISTS idx_send_queue_account_id ON send_queue(account_id);

-- 5. RPC: increment_daily_count – atomically bumps daily new-contact count
--    Resets if the window has expired (> 24 hours since last reset).
CREATE OR REPLACE FUNCTION increment_daily_count(p_account_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INT;
BEGIN
  UPDATE sessions
  SET
    daily_new_contact_count = CASE
      WHEN daily_count_reset_at IS NULL
        OR daily_count_reset_at < NOW() - INTERVAL '24 hours'
      THEN 1
      ELSE daily_new_contact_count + 1
    END,
    daily_count_reset_at = CASE
      WHEN daily_count_reset_at IS NULL
        OR daily_count_reset_at < NOW() - INTERVAL '24 hours'
      THEN NOW()
      ELSE daily_count_reset_at
    END
  WHERE account_id = p_account_id
  RETURNING daily_new_contact_count INTO v_new_count;

  RETURN v_new_count;
END;
$$;
