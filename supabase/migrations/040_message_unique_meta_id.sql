-- Add a UNIQUE constraint to messages.message_id to ensure webhook idempotency
-- Meta's message_id (wamid) and WWebJS message IDs are globally unique.

ALTER TABLE public.messages
ADD CONSTRAINT uq_messages_message_id UNIQUE (message_id);
