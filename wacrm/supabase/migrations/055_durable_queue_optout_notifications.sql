-- Migration 055: Durable send_queue drain, opt-out, queued recipient
-- status, and broadcast notification types.
--
-- Phase 2: send_queue existed (038) but was unused. Add retry columns
-- plus a SKIP LOCKED claim RPC so the worker can drain without
-- double-processing.
-- Phase 4c: contacts.opted_out so STOP/UNSUBSCRIBE is honored.
-- Phase 5a: extend notifications.type for broadcast lifecycle events.
-- Phase 5b: resolve_group_members also understands custom_field filters
-- and excludes opted-out contacts.

-- ============================================================
-- send_queue retry / drain
-- ============================================================
ALTER TABLE send_queue
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE send_queue
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE send_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_send_queue_drain
  ON send_queue (next_attempt_at, created_at)
  WHERE status = 'pending';

-- Claim up to p_limit pending rows. SKIP LOCKED so overlapping worker
-- ticks (or a web cron draining cloud_api jobs) never process the
-- same row twice.
CREATE OR REPLACE FUNCTION claim_send_queue_jobs(p_limit INTEGER DEFAULT 5)
RETURNS SETOF send_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE send_queue sq
  SET status = 'processing',
      updated_at = now()
  WHERE sq.id IN (
    SELECT id FROM send_queue
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50))
  )
  RETURNING sq.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_send_queue_jobs(INTEGER) TO service_role;

-- ============================================================
-- broadcast_recipients: allow 'queued' (Phase 1 leftover + 2b)
-- ============================================================
ALTER TABLE broadcast_recipients
  DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;
ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'replied', 'failed'));

-- queued is in-flight, same as pending — contributes to no counters.
-- (_bcast_cols_for_status already returns {} for unknown statuses.)

-- ============================================================
-- contacts.opted_out
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_opted_out
  ON contacts (account_id)
  WHERE opted_out = TRUE;

-- ============================================================
-- notifications: broadcast lifecycle types
-- ============================================================
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'broadcast_sent',
    'broadcast_failed',
    'broadcast_scheduled'
  ));

GRANT SELECT, INSERT, UPDATE ON public.notifications TO service_role;

-- Cron (service_role) and wizard (authenticated) both need broadcasts.
-- Same GRANT gap as 051/053: tables were created with RLS but no privileges
-- for the API roles, which surfaces as "permission denied for table X".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_custom_values TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_group_members TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_steps TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_enrollments TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_events TO service_role, authenticated;

-- ============================================================
-- resolve_group_members: custom_field filter + opted_out exclusion
--
-- smart_filter shapes (in addition to 054 tag_ids):
--   { "custom_field": { "field_id": "<uuid>", "operator": "is"|"is_not"|"contains", "value": "..." } }
-- tag_ids and custom_field AND together when both are present.
-- Empty / null filter still matches all (non-opted-out) account contacts.
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_group_members(p_group_id UUID)
RETURNS TABLE (contact_id UUID) AS $$
DECLARE
  v_is_smart BOOLEAN;
  v_account_id UUID;
  v_filter JSONB;
  v_tag_ids TEXT[];
  v_match TEXT;
  v_has_tags BOOLEAN;
  v_has_cf BOOLEAN;
  v_cf JSONB;
  v_cf_field UUID;
  v_cf_op TEXT;
  v_cf_value TEXT;
BEGIN
  SELECT is_smart, account_id, smart_filter
    INTO v_is_smart, v_account_id, v_filter
  FROM contact_groups WHERE id = p_group_id;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_is_smart THEN
    RETURN QUERY
    SELECT cgm.contact_id
    FROM contact_group_members cgm
    JOIN contacts c ON c.id = cgm.contact_id
    WHERE cgm.group_id = p_group_id
      AND COALESCE(c.opted_out, FALSE) = FALSE;
    RETURN;
  END IF;

  v_has_tags := v_filter IS NOT NULL
    AND (v_filter ? 'tag_ids')
    AND jsonb_array_length(COALESCE(v_filter->'tag_ids', '[]'::jsonb)) > 0;
  v_has_cf := v_filter IS NOT NULL AND (v_filter ? 'custom_field');

  -- No filter configured → all non-opted-out account contacts.
  IF NOT v_has_tags AND NOT v_has_cf THEN
    RETURN QUERY
    SELECT c.id FROM contacts c
    WHERE c.account_id = v_account_id
      AND COALESCE(c.opted_out, FALSE) = FALSE;
    RETURN;
  END IF;

  IF v_has_tags THEN
    v_tag_ids := ARRAY(
      SELECT t.value#>>'{}'
      FROM jsonb_array_elements(v_filter->'tag_ids') AS t
    );
    v_match := COALESCE(v_filter->>'match', 'any');
    IF v_match NOT IN ('any', 'all') THEN
      RAISE EXCEPTION 'Unsupported smart_filter match mode: % (expected "any" or "all")', v_match
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_has_cf THEN
    v_cf := v_filter->'custom_field';
    IF jsonb_typeof(v_cf) <> 'object'
       OR COALESCE(v_cf->>'field_id', '') = ''
       OR COALESCE(v_cf->>'value', '') = '' THEN
      RAISE EXCEPTION 'smart_filter.custom_field requires field_id and value'
        USING ERRCODE = '22023';
    END IF;
    v_cf_field := (v_cf->>'field_id')::uuid;
    v_cf_op := COALESCE(v_cf->>'operator', 'is');
    v_cf_value := v_cf->>'value';
    IF v_cf_op NOT IN ('is', 'is_not', 'contains') THEN
      RAISE EXCEPTION 'Unsupported smart_filter custom_field operator: %', v_cf_op
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  WITH tag_set AS (
    SELECT c.id AS cid
    FROM contacts c
    WHERE c.account_id = v_account_id
      AND COALESCE(c.opted_out, FALSE) = FALSE
      AND (
        NOT v_has_tags
        OR (
          v_match = 'any' AND EXISTS (
            SELECT 1 FROM contact_tags ct
            WHERE ct.contact_id = c.id AND ct.tag_id = ANY(v_tag_ids::uuid[])
          )
        )
        OR (
          v_match = 'all' AND (
            SELECT count(DISTINCT ct.tag_id) FROM contact_tags ct
            WHERE ct.contact_id = c.id AND ct.tag_id = ANY(v_tag_ids::uuid[])
          ) = array_length(v_tag_ids, 1)
        )
      )
  )
  SELECT ts.cid
  FROM tag_set ts
  WHERE NOT v_has_cf
     OR (
       v_cf_op = 'is' AND EXISTS (
         SELECT 1 FROM contact_custom_values cv
         WHERE cv.contact_id = ts.cid
           AND cv.custom_field_id = v_cf_field
           AND cv.value = v_cf_value
       )
     )
     OR (
       v_cf_op = 'is_not' AND EXISTS (
         SELECT 1 FROM contact_custom_values cv
         WHERE cv.contact_id = ts.cid
           AND cv.custom_field_id = v_cf_field
           AND cv.value IS DISTINCT FROM v_cf_value
       )
     )
     OR (
       v_cf_op = 'contains' AND EXISTS (
         SELECT 1 FROM contact_custom_values cv
         WHERE cv.contact_id = ts.cid
           AND cv.custom_field_id = v_cf_field
           AND cv.value ILIKE '%' || v_cf_value || '%'
       )
     );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
