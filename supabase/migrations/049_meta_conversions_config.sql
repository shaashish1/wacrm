-- Migration 049: Meta Conversions API Config & Audit Logs
CREATE TABLE IF NOT EXISTS meta_conversions_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  test_event_code TEXT,
  events_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE TABLE IF NOT EXISTS meta_conversion_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_conversions_config_account ON meta_conversions_config(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_account ON meta_conversion_events(account_id);

ALTER TABLE meta_conversions_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_conversion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage meta_conversions_config in their accounts"
  ON meta_conversions_config FOR ALL USING (is_account_member(account_id, auth.uid()));

CREATE POLICY "Users can view meta_conversion_events in their accounts"
  ON meta_conversion_events FOR SELECT USING (is_account_member(account_id, auth.uid()));
