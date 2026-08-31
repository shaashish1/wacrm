-- Migration 061: Generic consult appointments for the Booking A2A agent.
-- No reason-for-visit / notes / clinical fields. WhatsApp is marketing
-- and generic scheduling only — not a HIPAA channel.

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'consult'
    CHECK (kind IN ('consult', 'intro', 'tour')),
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'canceled', 'handoff')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_slot CHECK (slot_end > slot_start)
);

CREATE INDEX IF NOT EXISTS idx_appointments_account
  ON appointments (account_id, slot_start DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_contact
  ON appointments (account_id, contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_select ON appointments;
DROP POLICY IF EXISTS appointments_insert ON appointments;
DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments
  TO service_role, authenticated;
