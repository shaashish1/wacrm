-- Migration: Dual Provider Sessions & WWebJS
-- Description: Adds provider_type to accounts and creates sessions table for WWebJS

-- 1. Add provider_type to accounts
CREATE TYPE provider_type_enum AS ENUM ('cloud_api', 'wwebjs');

ALTER TABLE accounts
ADD COLUMN provider_type provider_type_enum DEFAULT 'cloud_api' NOT NULL;

-- 2. Create sessions table for WWebJS
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider_type provider_type_enum NOT NULL DEFAULT 'wwebjs',
    client_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_configured',
    phone_number TEXT,
    warming_started_at TIMESTAMPTZ,
    warming_graduated_at TIMESTAMPTZ,
    daily_new_contact_count INT DEFAULT 0,
    daily_count_reset_at TIMESTAMPTZ,
    health_score INT DEFAULT 100,
    last_connected_at TIMESTAMPTZ,
    worker_instance_id TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(account_id)
);

-- RLS for sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sessions of their accounts"
    ON sessions FOR SELECT
    USING (
        account_id IN (
            SELECT account_id FROM account_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage sessions of their accounts"
    ON sessions FOR ALL
    USING (
        account_id IN (
            SELECT account_id FROM account_members WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Create updated_at trigger
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
