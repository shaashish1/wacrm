-- Migration 063: Durable outbound webhook delivery queue
--
-- Endpoint CRUD already ships (028). Deliveries were a single
-- in-process attempt from the inbound webhook `after()` block — a
-- 5xx, timeout, or process death dropped the event. This table +
-- SKIP LOCKED claim RPC is the retry-with-backoff path (US-8).
-- Do not apply this file by starting local Supabase from this change.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint_id     uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event           text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'skipped')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_drain
  ON webhook_deliveries (next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON webhook_deliveries (endpoint_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_deliveries_select ON webhook_deliveries;
CREATE POLICY webhook_deliveries_select ON webhook_deliveries FOR SELECT
  USING (is_account_member(account_id));

-- Enqueue + drain use the service-role client (same as send_queue).
-- Authenticated members may read history; they cannot mutate rows.

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_deliveries TO service_role;

-- 028 created webhook_endpoints without role GRANTs (same gap as 051).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints
  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION claim_webhook_deliveries(p_limit INTEGER DEFAULT 10)
RETURNS SETOF webhook_deliveries
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE webhook_deliveries wd
  SET status = 'processing',
      updated_at = now()
  WHERE wd.id IN (
    SELECT id FROM webhook_deliveries
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
  )
  RETURNING wd.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_webhook_deliveries(INTEGER) TO service_role;

DROP TRIGGER IF EXISTS update_webhook_deliveries_updated_at ON webhook_deliveries;
CREATE TRIGGER update_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
