-- Migration 048: Drip Campaigns & Automations Engine
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email', -- email | whatsapp | multi
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | paused | completed | archived
  audience_type TEXT DEFAULT 'group', -- group | filter | manual
  audience_group_id UUID REFERENCES contact_groups(id) ON DELETE SET NULL,
  audience_filter JSONB,
  trigger_type TEXT DEFAULT 'manual', -- manual | pipeline_stage | event
  trigger_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email', -- email | whatsapp
  email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  whatsapp_template_name TEXT,
  delay_hours INTEGER DEFAULT 24,
  exit_on_reply BOOLEAN DEFAULT TRUE,
  exit_on_stage_change BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | exited_reply | exited_stage | unsubscribed
  next_send_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
  step_id UUID REFERENCES campaign_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- sent | delivered | opened | clicked | replied | bounced | failed
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign ON campaign_steps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_due ON campaign_enrollments(next_send_at, status);
CREATE INDEX IF NOT EXISTS idx_campaign_events_enrollment ON campaign_events(enrollment_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage campaigns in their accounts"
  ON campaigns FOR ALL USING (is_account_member(account_id));

CREATE POLICY "Users can manage campaign_steps in their accounts"
  ON campaign_steps FOR ALL USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_account_member(c.account_id))
  );

CREATE POLICY "Users can manage campaign_enrollments in their accounts"
  ON campaign_enrollments FOR ALL USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_account_member(c.account_id))
  );

CREATE POLICY "Users can manage campaign_events in their accounts"
  ON campaign_events FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_enrollments ce
      JOIN campaigns c ON c.id = ce.campaign_id
      WHERE ce.id = enrollment_id AND is_account_member(c.account_id)
    )
  );
