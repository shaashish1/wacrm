-- Migration 057: Marketing consent ledger + public landing pages + UTM
-- attribution on contacts. Broadcasts and resolve_group_members require
-- an active WhatsApp consent row AND not opted_out (defense in depth
-- with the worker drain). HIPAA: landings store name/phone/email only.

-- ============================================================
-- landing_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  headline TEXT,
  body TEXT,
  consent_copy TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_pages_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_landing_pages_slug
  ON landing_pages (slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_account
  ON landing_pages (account_id);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members manage landing_pages" ON landing_pages;
CREATE POLICY "Members manage landing_pages"
  ON landing_pages FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages
  TO service_role, authenticated;

-- ============================================================
-- consents ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone_normalized TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  source TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  consent_text TEXT,
  ip TEXT,
  user_agent TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT consents_subject CHECK (
    contact_id IS NOT NULL
    OR (phone_normalized IS NOT NULL AND phone_normalized <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_consents_account_contact
  ON consents (account_id, contact_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_consents_account_phone
  ON consents (account_id, phone_normalized)
  WHERE revoked_at IS NULL AND phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_account_channel
  ON consents (account_id, channel)
  WHERE revoked_at IS NULL;

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read consents" ON consents;
DROP POLICY IF EXISTS "Members insert consents" ON consents;
CREATE POLICY "Members read consents"
  ON consents FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY "Members insert consents"
  ON consents FOR INSERT
  WITH CHECK (is_account_member(account_id));
-- Revoke (STOP) is service_role / SECURITY DEFINER; members do not UPDATE.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents
  TO service_role, authenticated;

-- ============================================================
-- contacts: UTM + landing attribution (no clinical fields)
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS landing_id UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_touch_at TIMESTAMPTZ;

-- ============================================================
-- contact_may_receive_marketing — worker + send-path gate
-- ============================================================
CREATE OR REPLACE FUNCTION contact_may_receive_marketing(
  p_contact_id UUID,
  p_channel TEXT DEFAULT 'whatsapp'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = p_contact_id
      AND COALESCE(c.opted_out, FALSE) = FALSE
      AND EXISTS (
        SELECT 1
        FROM consents cons
        WHERE cons.account_id = c.account_id
          AND cons.channel = p_channel
          AND cons.revoked_at IS NULL
          AND (
            cons.contact_id = c.id
            OR (
              cons.phone_normalized IS NOT NULL
              AND cons.phone_normalized <> ''
              AND cons.phone_normalized = c.phone_normalized
            )
          )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION contact_may_receive_marketing(UUID, TEXT)
  TO service_role, authenticated;

-- ============================================================
-- resolve_group_members: opted_out + active WhatsApp consent
-- (extends 055; same smart_filter shapes)
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
      AND COALESCE(c.opted_out, FALSE) = FALSE
      AND contact_may_receive_marketing(c.id, 'whatsapp');
    RETURN;
  END IF;

  v_has_tags := v_filter IS NOT NULL
    AND (v_filter ? 'tag_ids')
    AND jsonb_array_length(COALESCE(v_filter->'tag_ids', '[]'::jsonb)) > 0;
  v_has_cf := v_filter IS NOT NULL AND (v_filter ? 'custom_field');

  IF NOT v_has_tags AND NOT v_has_cf THEN
    RETURN QUERY
    SELECT c.id FROM contacts c
    WHERE c.account_id = v_account_id
      AND COALESCE(c.opted_out, FALSE) = FALSE
      AND contact_may_receive_marketing(c.id, 'whatsapp');
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
      AND contact_may_receive_marketing(c.id, 'whatsapp')
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

GRANT EXECUTE ON FUNCTION resolve_group_members(UUID)
  TO service_role, authenticated;
