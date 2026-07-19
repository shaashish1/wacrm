-- Migration: Send Queue
-- Description: Creates the send_queue table for worker-based sending

CREATE TABLE send_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider_type provider_type_enum NOT NULL,
    action TEXT NOT NULL, -- 'sendText', 'sendMedia', 'sendTemplate', 'sendInteractive', etc.
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for queue polling
CREATE INDEX idx_send_queue_status ON send_queue(status, created_at) WHERE status = 'pending';

-- RLS
ALTER TABLE send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account send queue"
    ON send_queue FOR SELECT
    USING (
        account_id IN (
            SELECT account_id FROM account_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their account send queue"
    ON send_queue FOR ALL
    USING (
        account_id IN (
            SELECT account_id FROM account_members WHERE user_id = auth.uid()
        )
    );

-- Create updated_at trigger
CREATE TRIGGER update_send_queue_updated_at
    BEFORE UPDATE ON send_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
