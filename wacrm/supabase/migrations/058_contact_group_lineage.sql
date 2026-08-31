-- Migration 058: Durable WhatsApp Group ID lineage on contacts.
-- US-1: imported phones keep a first-source Group ID plus a membership
-- row so subject renames do not lose lineage. Email stays a first-class
-- column (already on contacts); WhatsApp almost never supplies it.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source_group_id UUID REFERENCES wa_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source_group
  ON contacts (account_id, source_group_id)
  WHERE source_group_id IS NOT NULL;

-- Multi-group membership (one phone can sit in several WA groups).
CREATE TABLE IF NOT EXISTS contact_wa_groups (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES wa_groups(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_wa_groups_account
  ON contact_wa_groups (account_id);
CREATE INDEX IF NOT EXISTS idx_contact_wa_groups_group
  ON contact_wa_groups (group_id);

ALTER TABLE contact_wa_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_wa_groups_select ON contact_wa_groups;
DROP POLICY IF EXISTS contact_wa_groups_write ON contact_wa_groups;
CREATE POLICY contact_wa_groups_select ON contact_wa_groups FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY contact_wa_groups_write ON contact_wa_groups FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_wa_groups
  TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts
  TO service_role, authenticated;
