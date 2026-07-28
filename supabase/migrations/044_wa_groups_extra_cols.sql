-- Additional group metadata from Baileys
ALTER TABLE wa_groups
  ADD COLUMN IF NOT EXISTS restrict BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS announce BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS member_add_mode BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS join_approval_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_community_announce BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linked_parent TEXT,
  ADD COLUMN IF NOT EXISTS ephemeral_duration INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS participants_with_phone INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_wa_group_participants_account
  ON wa_group_participants(account_id);
