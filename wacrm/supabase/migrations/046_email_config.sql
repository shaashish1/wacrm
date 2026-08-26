-- Migration 046: Email Infrastructure Config
CREATE TABLE IF NOT EXISTS email_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp', -- smtp | resend | sendgrid
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass_encrypted TEXT,
  api_key_encrypted TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  daily_limit INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE email_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage email_configs in their accounts"
  ON email_configs FOR ALL
  USING (is_account_member(account_id));
