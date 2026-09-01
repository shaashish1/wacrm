-- Migration 062: Grant DML on pipelines / stages / deals
--
-- Same GRANT gap as 051 / 053 / 055: tables exist with RLS but the
-- service_role key used by `/api/v1` (and authenticated dashboard
-- clients on some hosts) can hit "permission denied" without
-- explicit privileges. No new tables.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO service_role, authenticated;
