// ============================================================
// GET  /api/v1/deals — list (scope: pipelines:read)
// POST /api/v1/deals — create (scope: pipelines:write)
//
// Filters: ?pipeline_id= ?status=open|won|lost ?contact_id=
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import { resolveAuditUserId, ContactError } from '@/lib/api/v1/contacts';
import {
  DEAL_SELECT,
  parseDealStatus,
  serializeDeal,
} from '@/lib/api/v1/pipelines';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);
    const pipelineId = url.searchParams.get('pipeline_id');
    const contactId = url.searchParams.get('contact_id');
    const statusRaw = url.searchParams.get('status');
    if (statusRaw) {
      const status = parseDealStatus(statusRaw);
      if (!status) {
        return fail('bad_request', "'status' must be 'open', 'won', or 'lost'", 400);
      }
    }

    let query = ctx.supabase
      .from('deals')
      .select(DEAL_SELECT)
      .eq('account_id', ctx.accountId);

    if (pipelineId) query = query.eq('pipeline_id', pipelineId);
    if (contactId) query = query.eq('contact_id', contactId);
    if (statusRaw) query = query.eq('status', statusRaw);

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/deals] list error:', error);
      return fail('internal', 'Failed to list deals', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeDeal(r as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return fail('bad_request', "'title' is required", 400);

    const pipelineId =
      typeof body.pipeline_id === 'string' ? body.pipeline_id : '';
    const stageId = typeof body.stage_id === 'string' ? body.stage_id : '';
    if (!pipelineId || !stageId) {
      return fail('bad_request', "'pipeline_id' and 'stage_id' are required", 400);
    }

    const { data: pipeline } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('id', pipelineId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!pipeline) return fail('not_found', 'Pipeline not found', 404);

    const { data: stage } = await ctx.supabase
      .from('pipeline_stages')
      .select('id')
      .eq('id', stageId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle();
    if (!stage) {
      return fail('bad_request', 'Stage does not belong to this pipeline', 400);
    }

    let contactId: string | null = null;
    if (body.contact_id != null) {
      if (typeof body.contact_id !== 'string') {
        return fail('bad_request', "'contact_id' must be a string", 400);
      }
      const { data: contact } = await ctx.supabase
        .from('contacts')
        .select('id')
        .eq('id', body.contact_id)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (!contact) return fail('bad_request', 'Contact not found in this account', 400);
      contactId = contact.id;
    }

    const status = body.status != null ? parseDealStatus(body.status) : 'open';
    if (!status) {
      return fail('bad_request', "'status' must be 'open', 'won', or 'lost'", 400);
    }

    const valueRaw = body.value;
    const value =
      typeof valueRaw === 'number'
        ? valueRaw
        : typeof valueRaw === 'string'
          ? Number(valueRaw)
          : 0;
    if (!Number.isFinite(value) || value < 0) {
      return fail('bad_request', "'value' must be a non-negative number", 400);
    }

    const userId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const { data, error } = await ctx.supabase
      .from('deals')
      .insert({
        account_id: ctx.accountId,
        user_id: userId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contactId,
        conversation_id:
          typeof body.conversation_id === 'string' ? body.conversation_id : null,
        assigned_to: typeof body.assigned_to === 'string' ? body.assigned_to : null,
        title,
        value,
        currency: typeof body.currency === 'string' ? body.currency : 'USD',
        notes: typeof body.notes === 'string' ? body.notes : null,
        expected_close_date:
          typeof body.expected_close_date === 'string'
            ? body.expected_close_date
            : null,
        status,
      })
      .select(DEAL_SELECT)
      .single();

    if (error) {
      console.error('[api/v1/deals] create error:', error);
      return fail('internal', 'Failed to create deal', 500);
    }

    return ok(serializeDeal(data as Record<string, unknown>), 201);
  } catch (err) {
    if (err instanceof ContactError) {
      return fail('internal', err.message, err.status);
    }
    return toApiErrorResponse(err);
  }
}
