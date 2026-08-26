-- Migration 051: Grant privileges on worker-touched tables
--
-- Several tables created in earlier migrations (e.g. `sessions` in 037,
-- `whatsapp_config`, `messages`, `send_queue`, `contacts`, `conversations`)
-- were created with RLS enabled but WITHOUT the standard Supabase GRANT
-- statements for the `anon`/`authenticated`/`service_role` roles. As a
-- result the worker (which uses the service_role key) could not persist QR
-- codes to `public.sessions` — the QR UI spun forever because the web app
-- polls `sessions` and never saw a `qr_code`.
--
-- This migration grants the missing DML privileges. RLS policies remain
-- the source of truth for anon/authenticated access; service_role bypasses
-- RLS by design (it is the trusted backend key).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions          TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_config   TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages         TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.send_queue       TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts         TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations    TO service_role, authenticated;
