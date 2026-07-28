 User approved Claude's plan
  ⎿  Plan saved to: C:\Users\Ashish Sharma\.claude\plans\serialized-twirling-cupcake.md · /plan to edit
     Plan: Marketing SaaS Platform Features for wacrm

     Context

     wacrm is a WhatsApp-only CRM with dual provider support (Cloud API + Baileys). To evolve it into a full marketing SaaS platform, we need four major capabilities:

     1. Anti-bot protection upgrade (Baileys mode safety)
     2. Contact groups & segmentation (foundation for campaigns)
     3. Email drip campaigns + pipeline automation (multi-channel marketing)
     4. Meta Conversions API (Facebook ad tracking)

     The codebase already has: pipelines/stages/deals tables, tags/custom fields, automations with wait/schedule steps, broadcasts, flows engine, and a public API. This plan builds on those foundations rather than
     starting from scratch.

     ---
     Phase 1: baileys-antiban Integration (1-2 days)

     Goal: Replace the basic RateGovernor with baileys-antiban for sophisticated anti-bot behavior.

     What exists

     - apps/worker/src/rate-governor.ts — simple 250/day cap + uniform 15-60s jitter
     - apps/worker/src/queue-processor.ts — calls rateGovernor.enforceLimits() before each send
     - apps/worker/src/providers/baileys-provider.ts — raw Baileys socket

     Implementation

     Step 1: Install baileys-antiban
     cd apps/worker && npm install baileys-antiban

     Step 2: Wrap Baileys socket with antiban middleware

     In baileys-provider.ts, after creating the Baileys socket in initializeSession():
     - Import createAntibanSocket from baileys-antiban
     - Wrap the raw socket: this.sock = createAntibanSocket(rawSock, antibanConfig)
     - Configure with the moderate preset as default (Gaussian jitter, 45 WPM typing, adaptive throttling)
     - Store preset choice in sessions.config JSONB (already exists) so it's configurable per account

     Step 3: Simplify RateGovernor

     Keep RateGovernor for the daily hard cap (250 msgs/day via increment_daily_count RPC) but remove the jitter logic — baileys-antiban handles timing now. The governor becomes a simple counter check.

     Step 4: Add settings UI

     In apps/web/src/components/settings/wwebjs-config.tsx, add a dropdown for anti-ban preset (conservative/moderate/aggressive/high-volume). Store in sessions.config.antibanPreset. The worker reads this on session
     init.

     Files to modify

     - apps/worker/package.json — add dependency
     - apps/worker/src/providers/baileys-provider.ts — wrap socket with antiban
     - apps/worker/src/rate-governor.ts — remove jitter, keep daily cap
     - apps/web/src/components/settings/wwebjs-config.tsx — preset selector UI

     Verification

     - Start worker with npm run dev, pair a test number
     - Send 5+ messages and observe Gaussian-distributed delays in logs
     - Verify typing indicators appear before messages
     - Confirm daily cap still enforced (RateGovernor throws at 250)

     ---
     Phase 2: Contact Groups & Enhanced Segmentation (3-5 days)

     Goal: Application-layer contact groups for organizing contacts into broadcast/campaign audiences.

     What exists

     - tags + contact_tags tables — simple label system
     - custom_fields + contact_custom_values — user-defined fields
     - filter_contacts_by_tags() RPC — tag-based filtering with pagination
     - broadcasts.audience_filter JSONB — already supports filter-based audience selection
     - No "contact group" entity yet

     Implementation

     Step 1: Database — Contact Groups

     New migration 045_contact_groups.sql:
     CREATE TABLE contact_groups (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       description TEXT,
       color TEXT DEFAULT '#6366f1',
       is_smart BOOLEAN DEFAULT FALSE,
       smart_filter JSONB,  -- for smart/dynamic groups: filter criteria
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );

     CREATE TABLE contact_group_members (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       group_id UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
       contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
       added_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(group_id, contact_id)
     );

     -- RLS policies using is_account_member()
     -- Indexes on (account_id), (group_id), (contact_id)

     Two group types:
     - Static groups: Manual membership via contact_group_members
     - Smart groups: Dynamic membership defined by smart_filter JSONB (reuse the same filter format as broadcasts.audience_filter)

     Step 2: API routes

     Create apps/web/src/app/api/contact-groups/route.ts (GET, POST) and [id]/route.ts (GET, PATCH, DELETE), plus [id]/members/route.ts (GET, POST, DELETE) for member management.

     Add a resolve_group_members(group_id) RPC that returns contact IDs — for static groups it reads contact_group_members, for smart groups it evaluates smart_filter dynamically.

     Step 3: UI — Contact Groups page

     Add /contact-groups dashboard page with:
     - List of groups with member counts
     - Create/edit group dialog (name, description, color, static vs smart)
     - Smart group filter builder (reuse the filter patterns from broadcasts)
     - Member management: add/remove contacts, bulk add from WA groups
     - "Add to group" action on the contacts page and wa-groups page

     Step 4: Integrate with broadcasts

     Update the broadcast creation flow to support selecting a contact group as the audience source (in addition to the existing filter-based selection).

     Step 5: Public API v1

     Add /api/v1/contact-groups endpoints (GET, POST) and /api/v1/contact-groups/[id]/members (GET, POST, DELETE).

     Files to create/modify

     - supabase/migrations/045_contact_groups.sql — new tables + RLS + RPCs
     - apps/web/src/app/api/contact-groups/route.ts — CRUD
     - apps/web/src/app/api/contact-groups/[id]/route.ts — single group
     - apps/web/src/app/api/contact-groups/[id]/members/route.ts — membership
     - apps/web/src/app/(dashboard)/contact-groups/page.tsx — UI
     - apps/web/src/app/api/v1/contact-groups/ — public API
     - apps/web/messages/en.json + ko.json — i18n keys

     Verification

     - Create a static group, add contacts manually
     - Create a smart group with tag/field filters, verify dynamic resolution
     - Use a contact group as broadcast audience
     - Test public API endpoints

     ---
     Phase 3: Email Infrastructure + Drip Campaigns (7-10 days)

     Goal: Multi-channel marketing with email drip sequences tied to pipeline stages.

     What exists

     - Pipeline tables: pipelines, pipeline_stages (ordered, with position/color), deals
     - Automations engine with automation_pending_executions for scheduled/delayed steps
     - Flows engine with node-graph state machine
     - Broadcasts for bulk sending
     - No email infrastructure whatsoever

     Sub-phase 3A: Email Infrastructure (3 days)

     Step 1: SMTP/Email provider config

     New migration 046_email_config.sql:
     CREATE TABLE email_configs (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       provider TEXT NOT NULL DEFAULT 'smtp',  -- smtp | resend | sendgrid
       smtp_host TEXT,
       smtp_port INTEGER DEFAULT 587,
       smtp_user TEXT,
       smtp_pass_encrypted TEXT,  -- AES-256-GCM like WhatsApp tokens
       api_key_encrypted TEXT,    -- for Resend/SendGrid
       from_email TEXT NOT NULL,
       from_name TEXT,
       reply_to TEXT,
       is_active BOOLEAN DEFAULT TRUE,
       daily_limit INTEGER DEFAULT 500,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(account_id)
     );

     Step 2: Email sending service

     Create apps/web/src/lib/email/ with:
     - config.ts — load + decrypt email config (reuse encryption.ts patterns)
     - send.ts — unified send function supporting SMTP (via nodemailer) and API providers (Resend/SendGrid via fetch)
     - types.ts — EmailMessage, EmailResult, EmailConfig types
     - tracking.ts — open/click tracking pixel insertion + redirect link wrapping

     Install nodemailer in apps/web.

     Step 3: Email templates

     New migration 047_email_templates.sql:
     CREATE TABLE email_templates (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       subject TEXT NOT NULL,
       body_html TEXT NOT NULL,
       body_text TEXT,
       category TEXT DEFAULT 'general',  -- general | drip | transactional
       variables JSONB DEFAULT '[]',  -- list of {{variable}} placeholders
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );

     Step 4: Settings UI

     Add "Email" section to settings (email-config.tsx):
     - Provider selector (SMTP / Resend / SendGrid)
     - SMTP host/port/user/pass fields
     - API key field for cloud providers
     - From email/name, reply-to
     - Test email button (send to self)
     - Daily send limit

     Sub-phase 3B: Drip Campaigns (4-5 days)

     Step 1: Campaign entity

     New migration 048_campaigns.sql:
     CREATE TABLE campaigns (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       channel TEXT NOT NULL DEFAULT 'email',  -- email | whatsapp | multi
       status TEXT NOT NULL DEFAULT 'draft',   -- draft | active | paused | completed | archived
       audience_type TEXT DEFAULT 'group',     -- group | filter | manual
       audience_group_id UUID REFERENCES contact_groups(id),
       audience_filter JSONB,
       trigger_type TEXT DEFAULT 'manual',     -- manual | pipeline_stage | event
       trigger_config JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );

     CREATE TABLE campaign_steps (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
       position INTEGER NOT NULL,
       channel TEXT NOT NULL DEFAULT 'email',   -- email | whatsapp
       email_template_id UUID REFERENCES email_templates(id),
       whatsapp_template_name TEXT,
       delay_hours INTEGER DEFAULT 24,          -- wait time before this step
       exit_on_reply BOOLEAN DEFAULT TRUE,      -- stop sequence if contact replies
       exit_on_stage_change BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );

     CREATE TABLE campaign_enrollments (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
       contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
       current_step INTEGER DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'active',   -- active | completed | exited_reply | exited_stage | unsubscribed
       next_send_at TIMESTAMPTZ,
       enrolled_at TIMESTAMPTZ DEFAULT NOW(),
       completed_at TIMESTAMPTZ,
       UNIQUE(campaign_id, contact_id)
     );

     CREATE TABLE campaign_events (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       enrollment_id UUID NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
       step_id UUID REFERENCES campaign_steps(id),
       event_type TEXT NOT NULL,  -- sent | delivered | opened | clicked | replied | bounced | failed
       metadata JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );

     Step 2: Campaign engine

     Create apps/web/src/lib/campaigns/:
     - engine.ts — main campaign processor
       - Cron endpoint (/api/campaigns/cron) polls campaign_enrollments where next_send_at <= now() and status = 'active'
       - For each due enrollment: send the current step's email/WhatsApp message, record event, advance current_step, calculate next_send_at based on next step's delay_hours
       - Handle exit conditions: check for reply (from messages table), check for stage change (from deals table)
     - enroll.ts — enrollment logic: resolve audience (from group or filter), create campaign_enrollments rows, set initial next_send_at

     Step 3: Pipeline stage triggers

     Extend the existing automations engine or add a lightweight trigger in the deals update path:
     - When a deal moves to a new stage, check if any active campaign has trigger_type = 'pipeline_stage' and trigger_config.stage_id matching
     - Auto-enroll the deal's contact into that campaign

     Step 4: Reply tracking for exit conditions

     In the webhook route (/api/whatsapp/webhook), after processing an inbound message:
     - Check if the contact has any active campaign_enrollments
     - If exit_on_reply is true for the current step, mark enrollment as exited_reply

     Similarly for email: the email tracking endpoint marks opens/clicks, and an inbound email handler (if IMAP polling is added later) can trigger reply exits.

     Step 5: Campaign UI

     Add /campaigns dashboard page:
     - Campaign list with status badges, enrollment counts, step counts
     - Campaign builder: name, channel, audience (group selector), trigger type
     - Step editor: ordered list of steps with template selector, delay config, exit conditions
     - Campaign detail view: enrollment list with per-contact status, event timeline
     - Analytics: sent/delivered/opened/clicked/replied funnel visualization (reuse recharts)

     Step 6: Cron setup

     Add a cron API route /api/campaigns/cron (same pattern as /api/automations/cron and /api/flows/cron). Configure it to run every 5 minutes via Vercel Cron or external cron.

     Files to create/modify

     - supabase/migrations/046_email_config.sql
     - supabase/migrations/047_email_templates.sql
     - supabase/migrations/048_campaigns.sql
     - apps/web/package.json — add nodemailer
     - apps/web/src/lib/email/config.ts, send.ts, types.ts, tracking.ts
     - apps/web/src/lib/campaigns/engine.ts, enroll.ts, types.ts
     - apps/web/src/components/settings/email-config.tsx
     - apps/web/src/app/api/email-templates/ — CRUD routes
     - apps/web/src/app/api/campaigns/ — CRUD + cron routes
     - apps/web/src/app/(dashboard)/campaigns/ — UI pages
     - apps/web/src/app/(dashboard)/email-templates/ — template editor
     - apps/web/src/app/api/whatsapp/webhook/route.ts — reply exit check
     - apps/web/messages/en.json + ko.json — i18n keys

     Verification

     - Configure SMTP in settings, send test email
     - Create an email template with variables
     - Create a 3-step drip campaign targeting a contact group
     - Enroll contacts, verify emails send on schedule
     - Reply to an email/WhatsApp, verify enrollment exits
     - Move a deal to a stage, verify auto-enrollment triggers
     - Check analytics dashboard shows correct funnel

     ---
     Phase 4: Meta Conversions API (3-5 days)

     Goal: Server-to-server Facebook ad conversion tracking from CRM events.

     What exists

     - whatsapp_config table with access tokens (already connected to Meta)
     - Pipeline stages + deals for conversion events
     - Contacts with phone + email for identity matching
     - No Facebook Pixel or Conversions API code

     Implementation

     Step 1: Config

     New migration 049_meta_conversions_config.sql:
     CREATE TABLE meta_conversions_config (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       pixel_id TEXT NOT NULL,
       access_token_encrypted TEXT NOT NULL,  -- AES-256-GCM
       is_active BOOLEAN DEFAULT TRUE,
       test_event_code TEXT,  -- for testing in Meta Events Manager
       events_config JSONB DEFAULT '{}',  -- which CRM events to forward
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(account_id)
     );

     Step 2: Conversions API client

     Create apps/web/src/lib/meta-conversions/:
     - client.ts — POST to graph.facebook.com/v21.0/{pixel_id}/events
       - Hash PII fields (email, phone) with SHA-256 before sending
       - Support standard events: Lead, CompleteRegistration, Purchase, Subscribe
       - Map CRM events to Meta events via events_config JSONB
     - types.ts — Meta CAPI event schema types
     - hash.ts — SHA-256 hashing utility for PII normalization (lowercase, trim, hash)

     Step 3: Event triggers

     Fire conversion events from existing CRM actions:
     - New contact created -> Lead event (in contact creation endpoints)
     - Deal won -> Purchase event with deal value (in deals update path)
     - Deal stage change -> custom event (configurable per stage)
     - Broadcast reply -> CompleteRegistration (contact engaged)

     Add a lightweight fireConversionEvent(accountId, eventName, userData, customData) function that checks if Meta Conversions is configured and active, then fires asynchronously (non-blocking).

     Step 4: Settings UI

     Add "Facebook Ads" section to settings:
     - Pixel ID input
     - Access token input (encrypted at rest)
     - Test Event Code for debugging
     - Toggle which CRM events map to which Meta events
     - Test button (fire a test event to Meta Events Manager)

     Step 5: Event log

     Add a meta_conversion_events table for audit trail:
     CREATE TABLE meta_conversion_events (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       account_id UUID NOT NULL,
       event_name TEXT NOT NULL,
       contact_id UUID,
       deal_id UUID,
       payload JSONB,
       response_status INTEGER,
       response_body JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );

     Files to create/modify

     - supabase/migrations/049_meta_conversions_config.sql
     - apps/web/src/lib/meta-conversions/client.ts, types.ts, hash.ts
     - apps/web/src/components/settings/meta-conversions-config.tsx
     - apps/web/src/app/api/meta-conversions/ — config CRUD + test endpoint
     - Touch points for event firing: contact creation, deal update, broadcast handlers
     - apps/web/messages/en.json + ko.json — i18n keys

     Verification

     - Configure Pixel ID + access token in settings
     - Fire test event, verify it appears in Meta Events Manager
     - Create a contact, verify Lead event fires
     - Close a deal as won, verify Purchase event fires with correct value
     - Check event log for audit trail

     ---
     Implementation Order & Dependencies

     Phase 1 (baileys-antiban)     -- standalone, no dependencies
         |
     Phase 2 (contact groups)     -- standalone, no dependencies
         |
         v
     Phase 3 (email + campaigns)  -- depends on Phase 2 (groups as audience)
         |
     Phase 4 (Meta CAPI)          -- standalone, but benefits from Phase 3 (deal events)
       created_at TIMESTAMPTZ DEFAULT NOW()
     );

     Files to create/modify

     - supabase/migrations/049_meta_conversions_config.sql
     - apps/web/src/lib/meta-conversions/client.ts, types.ts, hash.ts
     - apps/web/src/components/settings/meta-conversions-config.tsx
     - apps/web/src/app/api/meta-conversions/ — config CRUD + test endpoint
     - Touch points for event firing: contact creation, deal update, broadcast handlers
       payload JSONB,
       response_status INTEGER,
       response_body JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );

     Files to create/modify

     - supabase/migrations/049_meta_conversions_config.sql

     - supabase/migrations/049_meta_conversions_config.sql
     - apps/web/src/lib/meta-conversions/client.ts, types.ts, hash.ts
     - apps/web/src/components/settings/meta-conversions-config.tsx

     Files to create/modify


     - supabase/migrations/049_meta_conversions_config.sql
     - apps/web/src/lib/meta-conversions/client.ts, types.ts, hash.ts
     - apps/web/src/components/settings/meta-conversions-config.tsx
     - apps/web/src/app/api/meta-conversions/ — config CRUD + test endpoint
     - Touch points for event firing: contact creation, deal update, broadcast handlers
     - apps/web/messages/en.json + ko.json — i18n keys

     Verification

     - Configure Pixel ID + access token in settings
     - Fire test event, verify it appears in Meta Events Manager
     - Create a contact, verify Lead event fires
     - Close a deal as won, verify Purchase event fires with correct value
     - Check event log for audit trail

     ---
     Implementation Order & Dependencies

     Phase 1 (baileys-antiban)     -- standalone, no dependencies
         |
     Phase 2 (contact groups)     -- standalone, no dependencies
         |
         v
     Phase 3 (email + campaigns)  -- depends on Phase 2 (groups as audience)
         |
     Phase 4 (Meta CAPI)          -- standalone, but benefits from Phase 3 (deal events)


     - supabase/migrations/049_meta_conversions_config.sql
     - apps/web/src/lib/meta-conversions/client.ts, types.ts, hash.ts
     - apps/web/src/components/settings/meta-conversions-config.tsx
     - apps/web/src/app/api/meta-conversions/ — config CRUD + test endpoint
     - Touch points for event firing: contact creation, deal update, broadcast handlers
     - apps/web/messages/en.json + ko.json — i18n keys

     Verification

     - Configure Pixel ID + access token in settings
     - Fire test event, verify it appears in Meta Events Manager
     - Create a contact, verify Lead event fires
     - Close a deal as won, verify Purchase event fires with correct value
     - Check event log for audit trail

     ---
     Implementation Order & Dependencies

     Phase 1 (baileys-antiban)     -- standalone, no dependencies
         |
     Phase 2 (contact groups)     -- standalone, no dependencies
         |
         v
     Phase 3 (email + campaigns)  -- depends on Phase 2 (groups as audience)
         |
     Phase 4 (Meta CAPI)          -- standalone, but benefits from Phase 3 (deal events)

     Phases 1 and 2 can run in parallel. Phase 3 depends on Phase 2 for contact groups as campaign audiences. Phase 4 is independent but richer with Phase 3's deal pipeline events.

     Estimated total: 14-22 days of development.

     ---
     Key Design Decisions

     1. Reuse existing encryption (apps/web/src/lib/whatsapp/encryption.ts) for all new secrets (SMTP passwords, API keys, Meta access tokens)
     2. Reuse existing cron pattern (/api/*/cron routes) for campaign step processing
     3. Reuse existing broadcast filter format for smart group smart_filter JSONB
     4. Campaign engine as cron-driven (like automations), not real-time queue — simpler, uses existing infrastructure
     5. nodemailer for SMTP — most mature Node.js email library, zero vendor lock-in
     6. Static + smart groups — static for manual curation, smart for dynamic filter-based audiences
     7. Pipeline stage triggers via lightweight event hooks in deal update path, not a full event bus

● The model claude-opus-4-6 is not available on your foundry deployment. Try /model to switch to claude-opus-4-5, or ask your admin to enable this model.