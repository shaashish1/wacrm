-- Migration 056: optional daily/weekly recurrence for scheduled broadcasts.
-- The broadcasts cron clones a new scheduled row after a recurring send
-- is claimed, so history for each occurrence stays intact.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS recurrence TEXT
  CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly'));

GRANT EXECUTE ON FUNCTION claim_send_queue_jobs(INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
