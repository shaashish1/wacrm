-- ============================================================
-- 053: Grant privileges on group, tag, and worker-touched tables
--
-- Migrations 051/052 (which grant DML on sessions, whatsapp_config,
-- messages, send_queue, contacts, conversations, profiles, accounts)
-- exist as files but had NOT been applied to the running DB (latest
-- applied migration was 050). Several tables created in earlier
-- migrations (e.g. `wa_groups`/`wa_group_participants` in 043/044,
-- `tags`/`contact_tags` in 001, `contacts` in 001) were created with
-- RLS enabled and NO GRANT statements for the API roles, so the
-- `service_role` (the worker's key) and `authenticated` (the web app)
-- could not SELECT/INSERT/UPDATE/DELETE them via the Data API.
--
-- Symptom: the worker's group sync fetched 91 groups and resolved
-- 9054 participant phones, but persisted ZERO participant rows and
-- ZERO contacts. The flow was:
--   1. upsert wa_groups  -> 403 (no INSERT/UPDATE) -> {error}, data null
--   2. .select('id').single() on wa_groups -> 403 (no SELECT) -> null
--   3. `if (!groupRow) continue;` -> participants never inserted
--   4. contact upsert from participants -> 403 (no INSERT on contacts)
-- So `wa_groups`, `wa_group_participants`, and `contacts` stayed empty
-- and the WA Groups page showed nothing, even after a successful
-- Baileys sync.
--
-- This migration grants the missing DML so the worker can persist groups
-- + participants and auto-build the contact database from group
-- membership, and the web app can read/manage them. RLS policies remain
-- the source of truth for anon/authenticated row access; service_role
-- bypasses RLS by design (it is the trusted backend key).
--
-- NOTE: 051/052 also grant on sessions, whatsapp_config, messages,
-- send_queue, contacts, conversations, profiles, accounts. Those grants
-- are duplicated here for resilience (GRANT is idempotent) so this one
-- migration makes the worker fully functional even if 051/052 are
-- applied later or out of order. profiles/accounts are intentionally
-- left to 052 to avoid colliding with that migration's intent.
--
-- Idempotent — GRANT is a no-op if the role already has the privilege.
-- ============================================================

-- WhatsApp groups + participants (worker writes, web reads)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_groups              TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_group_participants TO service_role, authenticated;

-- Tags + contact_tags: the worker auto-creates a "WA Group: <name>"
-- tag per group and applies it to imported contacts; the web app
-- manages tags as an admin. Both need DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags          TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO service_role, authenticated;

-- Worker-touched tables from 051 (re-granted here for resilience,
-- since 051 had not been applied): contacts (auto-built from groups),
-- conversations + messages (inbound message persistence), whatsapp_config
-- (auto-created on connect), send_queue (outbound queue).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts         TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations  TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages       TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_config TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.send_queue    TO service_role, authenticated;

-- Contact custom fields + notes (settings-class, but the worker/web
-- manage them alongside contacts).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields      TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_notes      TO service_role, authenticated;
