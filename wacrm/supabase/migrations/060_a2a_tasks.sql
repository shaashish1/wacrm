-- Migration 060: A2A task store for in-app agents (US-4 / P0 pair).
-- Same-origin cards + JSON-RPC live in the web app. Artifacts are JSON
-- only — never persist PHI (deny-list scan in the runner).

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  skill TEXT,
  state TEXT NOT NULL DEFAULT 'submitted'
    CHECK (state IN (
      'submitted',
      'working',
      'input-required',
      'completed',
      'failed',
      'canceled'
    )),
  context_id TEXT,
  input JSONB,
  artifacts JSONB,
  error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_account
  ON a2a_tasks (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_state
  ON a2a_tasks (account_id, state);

ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS a2a_tasks_select ON a2a_tasks;
DROP POLICY IF EXISTS a2a_tasks_insert ON a2a_tasks;
DROP POLICY IF EXISTS a2a_tasks_update ON a2a_tasks;
CREATE POLICY a2a_tasks_select ON a2a_tasks FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY a2a_tasks_insert ON a2a_tasks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY a2a_tasks_update ON a2a_tasks FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.a2a_tasks
  TO service_role, authenticated;
