// ============================================================
// POST /api/v1/broadcasts — launch a broadcast (scope: broadcasts:send).
//
// Cloud API (template):
//   { "name"?, "template_name", "template_language"?, "recipients": [{ "to", "params"? }] }
//
// wwebjs plain-text (durable send_queue, same path as the dashboard):
//   {
//     "name"?,
//     "body": "Hi {{name}}",
//     "media_url"?, "media_kind"?: "image"|"video"|"document",
//     "recipients": [{ "to": "+14155550123" }]
//       OR "audience": { "type": "all"|"tags"|"group", "tag_ids"?, "group_ids"? }
//   }
//
// Template fan-out still uses after(); plain-text returns after enqueue.
// Poll GET /api/v1/broadcasts/{id} for progress.
// ============================================================

import { after } from 'next/server';

import { requireApiKey } from '@/lib/auth/api-context';

export const maxDuration = 60;
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId, ContactError } from '@/lib/api/v1/contacts';
import {
  createBroadcast,
  deliverBroadcast,
  BroadcastError,
} from '@/lib/whatsapp/broadcast-core';
import { createAndEnqueuePlainBroadcast } from '@/lib/broadcasts/plain-broadcast';
import type { PlainMediaKind } from '@/lib/broadcasts/plain-jobs';

function parseMediaKind(value: unknown): PlainMediaKind | null {
  if (value === 'image' || value === 'video' || value === 'document' || value === 'audio') {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const templateName =
      typeof body.template_name === 'string' ? body.template_name : '';
    const plainBody = typeof body.body === 'string' ? body.body : '';
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    const auditUserId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    if (!templateName && plainBody.trim()) {
      const audienceRaw =
        body.audience && typeof body.audience === 'object'
          ? (body.audience as Record<string, unknown>)
          : null;
      let audience: {
        type: 'all' | 'tags' | 'group';
        tag_ids?: string[];
        group_ids?: string[];
      } | null = null;
      if (audienceRaw) {
        const audienceType = audienceRaw.type;
        if (
          audienceType === 'all' ||
          audienceType === 'tags' ||
          audienceType === 'group'
        ) {
          audience = {
            type: audienceType,
            tag_ids: Array.isArray(audienceRaw.tag_ids)
              ? audienceRaw.tag_ids.filter((id): id is string => typeof id === 'string')
              : undefined,
            group_ids: Array.isArray(audienceRaw.group_ids)
              ? audienceRaw.group_ids.filter((id): id is string => typeof id === 'string')
              : undefined,
          };
        }
      }

      const result = await createAndEnqueuePlainBroadcast(
        ctx.supabase,
        ctx.accountId,
        auditUserId,
        {
          name: typeof body.name === 'string' ? body.name : null,
          body: plainBody,
          mediaUrl: typeof body.media_url === 'string' ? body.media_url : null,
          mediaKind: parseMediaKind(body.media_kind),
          recipients: recipients.map((r) => ({
            to: typeof r?.to === 'string' ? r.to : '',
          })),
          audience,
        },
      );

      return ok(
        {
          broadcast_id: result.broadcastId,
          status: 'sending',
          total_recipients: result.totalRecipients,
          accepted: result.totalRecipients,
          rejected: result.rejected,
        },
        202,
      );
    }

    const plan = await createBroadcast(ctx.supabase, ctx.accountId, auditUserId, {
      name: typeof body.name === 'string' ? body.name : null,
      templateName,
      templateLanguage:
        typeof body.template_language === 'string'
          ? body.template_language
          : null,
      recipients: recipients.map((r) => ({
        to: typeof r?.to === 'string' ? r.to : '',
        params: Array.isArray(r?.params) ? r.params : undefined,
      })),
    });

    after(() => deliverBroadcast(ctx.supabase, plan));

    return ok(
      {
        broadcast_id: plan.broadcastId,
        status: 'sending',
        total_recipients: plan.planned.length,
        accepted: plan.planned.length,
        rejected: plan.rejected,
      },
      202
    );
  } catch (err) {
    if (err instanceof BroadcastError) {
      return fail(err.code, err.message, err.status);
    }
    if (err instanceof ContactError) {
      return fail(
        err.status === 400 ? 'bad_request' : 'internal',
        err.message,
        err.status
      );
    }
    return toApiErrorResponse(err);
  }
}
