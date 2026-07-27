-- WhatsApp groups synced from the connected device
CREATE TABLE IF NOT EXISTS wa_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  jid TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  owner_jid TEXT,
  size INTEGER DEFAULT 0,
  creation_ts BIGINT,
  is_community BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, jid)
);

ALTER TABLE wa_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Account members can view wa_groups"
  ON wa_groups FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY "Account admins can manage wa_groups"
  ON wa_groups FOR ALL
  USING (is_account_member(account_id, 'admin'));

-- Group participants with phone numbers
CREATE TABLE IF NOT EXISTS wa_group_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES wa_groups(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  jid TEXT NOT NULL,
  phone TEXT,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  is_super_admin BOOLEAN DEFAULT FALSE,
  UNIQUE(group_id, jid)
);

ALTER TABLE wa_group_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Account members can view wa_group_participants"
  ON wa_group_participants FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY "Account admins can manage wa_group_participants"
  ON wa_group_participants FOR ALL
  USING (is_account_member(account_id, 'admin'));

CREATE INDEX idx_wa_groups_account ON wa_groups(account_id);
CREATE INDEX idx_wa_group_participants_group ON wa_group_participants(group_id);
CREATE INDEX idx_wa_group_participants_phone ON wa_group_participants(phone) WHERE phone IS NOT NULL;
