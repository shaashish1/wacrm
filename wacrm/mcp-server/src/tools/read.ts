// ============================================================
// Read-only tools — always registered.
//
// whoami + list/read of contacts, conversations, messages, and
// broadcast status. None of these change state, so they're safe to
// expose unconditionally. Each carries readOnlyHint so clients can
// surface them without a confirmation prompt.
// ============================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WacrmClient } from '../client.js';
import { handle, jsonResult } from './shared.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export function registerReadTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Verify the API key and show which wacrm account it is bound to and what scopes it carries. Call this first to discover what actions are possible.',
      inputSchema: {},
      annotations: { ...READ_ONLY, title: 'Who am I' },
    },
    handle(async () => jsonResult(await client.me())),
  );

  server.registerTool(
    'list_contacts',
    {
      title: 'List contacts',
      description:
        'List contacts in the CRM, newest first. Optionally filter by a free-text search (matches name or phone) or by a tag id. Results are paginated: pass the returned next_cursor to fetch the next page.',
      inputSchema: {
        search: z.string().optional().describe('Free-text search over name or phone number.'),
        tag: z.string().optional().describe('Tag id to filter by.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor from a previous response.'),
      },
      annotations: { ...READ_ONLY, title: 'List contacts' },
    },
    handle(async (args) => jsonResult(await client.listContacts(args))),
  );

  server.registerTool(
    'get_contact',
    {
      title: 'Get contact',
      description: 'Read a single contact by its id.',
      inputSchema: {
        id: z.string().describe('Contact id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get contact' },
    },
    handle(async ({ id }) => jsonResult(await client.getContact(id))),
  );

  server.registerTool(
    'list_conversations',
    {
      title: 'List conversations',
      description:
        'List conversations, newest first. Optionally filter by status (open / pending / closed) or by contact id. Paginated.',
      inputSchema: {
        status: z.enum(['open', 'pending', 'closed']).optional().describe('Conversation status filter.'),
        contact_id: z.string().optional().describe('Only conversations for this contact.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List conversations' },
    },
    handle(async (args) => jsonResult(await client.listConversations(args))),
  );

  server.registerTool(
    'get_conversation',
    {
      title: 'Get conversation',
      description: 'Read a single conversation by id, including its contact and tags.',
      inputSchema: {
        id: z.string().describe('Conversation id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get conversation' },
    },
    handle(async ({ id }) => jsonResult(await client.getConversation(id))),
  );

  server.registerTool(
    'list_messages',
    {
      title: 'List messages',
      description:
        'List the messages in a conversation, newest first. Each message includes its direction (inbound/outbound), delivery status, and content. Paginated.',
      inputSchema: {
        conversation_id: z.string().describe('The conversation to read messages from.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List messages' },
    },
    handle(async ({ conversation_id, limit, cursor }) =>
      jsonResult(await client.listConversationMessages(conversation_id, { limit, cursor })),
    ),
  );

  server.registerTool(
    'get_broadcast',
    {
      title: 'Get broadcast status',
      description:
        'Read a broadcast campaign by id — its status and delivered / read / rejected counts. Use this to poll progress after launching one.',
      inputSchema: {
        id: z.string().describe('Broadcast id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get broadcast status' },
    },
    handle(async ({ id }) => jsonResult(await client.getBroadcast(id))),
  );

  server.registerTool(
    'list_wa_groups',
    {
      title: 'List WhatsApp groups',
      description:
        'List WhatsApp groups synced from the paired number. Optional search matches the group subject. Paginated. Importing a group is not marketing consent.',
      inputSchema: {
        search: z.string().optional().describe('Free-text search over group subject.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List WhatsApp groups' },
    },
    handle(async (args) => jsonResult(await client.listWaGroups(args))),
  );

  server.registerTool(
    'get_wa_group',
    {
      title: 'Get WhatsApp group',
      description: 'Read a single WhatsApp group by id.',
      inputSchema: {
        id: z.string().describe('WhatsApp group id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get WhatsApp group' },
    },
    handle(async ({ id }) => jsonResult(await client.getWaGroup(id))),
  );

  server.registerTool(
    'list_wa_group_participants',
    {
      title: 'List WhatsApp group participants',
      description:
        'List participants of a WhatsApp group. LID-only members have no phone and are not invented as contacts. Paginated.',
      inputSchema: {
        group_id: z.string().describe('WhatsApp group id.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List WhatsApp group participants' },
    },
    handle(async ({ group_id, limit, cursor }) =>
      jsonResult(await client.listWaGroupParticipants(group_id, { limit, cursor })),
    ),
  );

  server.registerTool(
    'list_consents',
    {
      title: 'List consents',
      description:
        'List marketing consent ledger rows. Filter by contact, channel (whatsapp/email), or status (active/revoked). Read-only — never grants or backfills consent.',
      inputSchema: {
        contact_id: z.string().optional().describe('Only consents for this contact.'),
        channel: z.enum(['whatsapp', 'email']).optional().describe('Consent channel.'),
        status: z.enum(['active', 'revoked']).optional().describe('Active (not revoked) or revoked.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List consents' },
    },
    handle(async (args) => jsonResult(await client.listConsents(args))),
  );

  server.registerTool(
    'get_consent',
    {
      title: 'Get consent',
      description: 'Read a single consent ledger row by id.',
      inputSchema: {
        id: z.string().describe('Consent id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get consent' },
    },
    handle(async ({ id }) => jsonResult(await client.getConsent(id))),
  );

  server.registerTool(
    'list_contact_groups',
    {
      title: 'List contact groups',
      description: 'List CRM contact groups (audiences), newest first. Paginated.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List contact groups' },
    },
    handle(async (args) => jsonResult(await client.listContactGroups(args))),
  );

  server.registerTool(
    'get_contact_group',
    {
      title: 'Get contact group',
      description: 'Read a single CRM contact group by id, including member_count.',
      inputSchema: {
        id: z.string().describe('Contact group id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get contact group' },
    },
    handle(async ({ id }) => jsonResult(await client.getContactGroup(id))),
  );

  server.registerTool(
    'list_contact_group_members',
    {
      title: 'List contact group members',
      description: 'List contact ids in a CRM contact group (smart groups resolve dynamically). Paginated.',
      inputSchema: {
        group_id: z.string().describe('Contact group id.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List contact group members' },
    },
    handle(async ({ group_id, limit, cursor }) =>
      jsonResult(await client.listContactGroupMembers(group_id, { limit, cursor })),
    ),
  );

  server.registerTool(
    'list_campaigns',
    {
      title: 'List campaigns',
      description:
        'List drip campaigns, newest first. Paginated. Enroll/pause stay on the REST API (writes are opt-in and consent-gated).',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List campaigns' },
    },
    handle(async (args) => jsonResult(await client.listCampaigns(args))),
  );

  server.registerTool(
    'get_campaign',
    {
      title: 'Get campaign',
      description: 'Read a single drip campaign by id, including steps.',
      inputSchema: {
        id: z.string().describe('Campaign id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get campaign' },
    },
    handle(async ({ id }) => jsonResult(await client.getCampaign(id))),
  );

  server.registerTool(
    'list_campaign_enrollments',
    {
      title: 'List campaign enrollments',
      description: 'List enrollments for a drip campaign. Paginated.',
      inputSchema: {
        campaign_id: z.string().describe('Campaign id.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List campaign enrollments' },
    },
    handle(async ({ campaign_id, limit, cursor }) =>
      jsonResult(await client.listCampaignEnrollments(campaign_id, { limit, cursor })),
    ),
  );

  server.registerTool(
    'list_pipelines',
    {
      title: 'List pipelines',
      description: 'List CRM pipelines with stages, newest first. Paginated.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List pipelines' },
    },
    handle(async (args) => jsonResult(await client.listPipelines(args))),
  );

  server.registerTool(
    'get_pipeline',
    {
      title: 'Get pipeline',
      description: 'Read a single pipeline by id, including stages.',
      inputSchema: {
        id: z.string().describe('Pipeline id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get pipeline' },
    },
    handle(async ({ id }) => jsonResult(await client.getPipeline(id))),
  );

  server.registerTool(
    'list_deals',
    {
      title: 'List deals',
      description:
        'List deals, newest first. Optional filters: pipeline_id, status (open/won/lost), contact_id. Paginated.',
      inputSchema: {
        pipeline_id: z.string().optional().describe('Only deals on this pipeline.'),
        status: z.enum(['open', 'won', 'lost']).optional().describe('Deal status filter.'),
        contact_id: z.string().optional().describe('Only deals for this contact.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor.'),
      },
      annotations: { ...READ_ONLY, title: 'List deals' },
    },
    handle(async (args) => jsonResult(await client.listDeals(args))),
  );

  server.registerTool(
    'get_deal',
    {
      title: 'Get deal',
      description: 'Read a single deal by id.',
      inputSchema: {
        id: z.string().describe('Deal id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get deal' },
    },
    handle(async ({ id }) => jsonResult(await client.getDeal(id))),
  );
}
