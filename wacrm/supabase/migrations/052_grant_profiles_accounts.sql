-- Migration 052: Grant privileges on profiles and accounts
--
-- Migration 051 granted DML on the worker-touched tables (sessions,
-- whatsapp_config, messages, send_queue, contacts, conversations) but
-- omitted `profiles` and `accounts`, which were created in migration 001
-- with RLS enabled and NO GRANT statements for the API roles.
--
-- Under the current Supabase default (`auto_expose_new_tables` unset —
-- new tables are NOT auto-exposed to anon/authenticated/service_role),
-- this left `profiles` and `accounts` unreadable via the Data API.
--
-- Symptom: the WhatsApp QR never rendered. The web app's `useAuth` hook
-- (`profiles.select(...).eq('user_id', ...)`) and the
-- `/api/whatsapp/config` route's `resolveAccountId` helper both SELECT from
-- `profiles` as the authenticated user — they got
-- `permission denied for table profiles` (42501), so `accountId` resolved
-- to null, the route returned `{ reason: 'no_account' }`, and the frontend
-- never received a `qr_code`. RLS policies are unchanged; they remain the
-- source of truth for anon/authenticated row access. service_role bypasses
-- RLS by design.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role, authenticated;

-- anon needs SELECT on profiles/accounts for the unauthenticated signup /
-- invitation-acceptance flows that look up an account before a session exists.
-- RLS still gates every row.
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.accounts TO anon;
