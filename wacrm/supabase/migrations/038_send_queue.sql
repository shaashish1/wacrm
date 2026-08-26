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

CREATE POLICY "Users can view send queue of their accounts"
    ON send_queue FOR SELECT
    USING (is_account_member(account_id));

CREATE POLICY "Users can manage send queue of their accounts"
    ON send_queue FOR ALL
    USING (is_account_member(account_id, 'admin'));

-- Create updated_at trigger
CREATE TRIGGER update_send_queue_updated_at
    BEFORE UPDATE ON send_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
