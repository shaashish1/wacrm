-- Migration 045: Contact Groups & Enhanced Segmentation
CREATE TABLE IF NOT EXISTS contact_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_smart BOOLEAN DEFAULT FALSE,
  smart_filter JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_groups_account ON contact_groups(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_group ON contact_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_contact ON contact_group_members(contact_id);

ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage contact_groups in their accounts"
  ON contact_groups FOR ALL
  USING (is_account_member(account_id));

CREATE POLICY "Users can manage contact_group_members in their accounts"
  ON contact_group_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contact_groups cg
      WHERE cg.id = group_id AND is_account_member(cg.account_id)
    )
  );

-- RPC to resolve group member contact IDs dynamically
CREATE OR REPLACE FUNCTION resolve_group_members(p_group_id UUID)
RETURNS TABLE (contact_id UUID) AS $$
DECLARE
  v_is_smart BOOLEAN;
  v_account_id UUID;
BEGIN
  SELECT is_smart, account_id INTO v_is_smart, v_account_id
  FROM contact_groups WHERE id = p_group_id;

  IF v_is_smart IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_is_smart THEN
    RETURN QUERY
    SELECT cgm.contact_id
    FROM contact_group_members cgm
    WHERE cgm.group_id = p_group_id;
  ELSE
    RETURN QUERY
    SELECT c.id FROM contacts c WHERE c.account_id = v_account_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
