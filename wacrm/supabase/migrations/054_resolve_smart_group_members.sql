-- Migration 054: Make resolve_group_members evaluate smart_filter
--
-- Migration 045 introduced contact_groups with an is_smart flag and a
-- smart_filter JSONB column, plus a resolve_group_members(p_group_id)
-- RPC. The RPC's smart branch was a placeholder: it returned EVERY
-- contact in the account regardless of the filter, so a smart group
-- behaved identically to "all contacts". This made smart groups
-- indistinguishable from a manual "all" audience and silently
-- enrolled the entire account into any campaign targeting a smart
-- group.
--
-- This migration replaces the placeholder with a real (if minimal)
-- filter engine. Supported smart_filter shapes:
--
--   { "tag_ids": [<uuid>, ...], "match": "any" | "all" }
--     Contacts having ANY (default) / ALL of the listed tag ids.
--   { "tag_ids": [<uuid>, ...] }
--     Defaults to match: "any".
--   {} or null
--     Matches all account contacts (preserves the prior behaviour for
--     smart groups with no configured filter, so existing "match all"
--     groups don't silently empty out).
--
-- Any other shape is treated as unsupported: the RPC raises a clear
-- exception instead of returning all contacts, so a misconfigured
-- group fails loudly rather than enrolling everyone. Callers that
-- want "all contacts" should use an empty filter {} explicitly.
--
-- The function remains SECURITY DEFINER so it can read across the
-- contact_tags join; RLS still gates the underlying contact_groups
-- lookup (the caller must be an account member to reach the group
-- row in the first place).

CREATE OR REPLACE FUNCTION resolve_group_members(p_group_id UUID)
RETURNS TABLE (contact_id UUID) AS $$
DECLARE
  v_is_smart BOOLEAN;
  v_account_id UUID;
  v_filter JSONB;
  v_tag_ids TEXT[];
  v_match TEXT;
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
    WHERE cgm.group_id = p_group_id;
    RETURN;
  END IF;

  -- Smart group: interpret smart_filter.
  IF v_filter IS NULL OR (v_filter ? 'tag_ids' = false) OR jsonb_array_length(COALESCE(v_filter->'tag_ids', '[]'::jsonb)) = 0 THEN
    -- No filter configured → match all account contacts. This
    -- preserves the behaviour smart groups had before this migration
    -- so existing "match all" groups don't silently empty out.
    RETURN QUERY
    SELECT c.id FROM contacts c WHERE c.account_id = v_account_id;
    RETURN;
  END IF;

  v_tag_ids := ARRAY(
    SELECT t.value#>>'{}'
    FROM jsonb_array_elements(v_filter->'tag_ids') AS t
  );

  v_match := COALESCE(v_filter->>'match', 'any');

  IF v_match = 'all' THEN
    -- Contacts tagged with EVERY id in the set.
    RETURN QUERY
    SELECT ct.contact_id
    FROM contact_tags ct
    JOIN contacts c ON c.id = ct.contact_id
    WHERE c.account_id = v_account_id
      AND ct.tag_id = ANY(v_tag_ids::uuid[])
    GROUP BY ct.contact_id
    HAVING count(DISTINCT ct.tag_id) = array_length(v_tag_ids, 1);
  ELSIF v_match = 'any' THEN
    -- Contacts tagged with ANY of the ids.
    RETURN QUERY
    SELECT DISTINCT ct.contact_id
    FROM contact_tags ct
    JOIN contacts c ON c.id = ct.contact_id
    WHERE c.account_id = v_account_id
      AND ct.tag_id = ANY(v_tag_ids::uuid[]);
  ELSE
    RAISE EXCEPTION 'Unsupported smart_filter match mode: % (expected "any" or "all")', v_match
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
