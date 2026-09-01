// ============================================================
// GET  /api/v1/pipelines — list (scope: pipelines:read)
// POST /api/v1/pipelines — create (scope: pipelines:write)
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
  PIPELINE_SELECT,
  parseStagesInput,
  serializePipeline,
} from '@/lib/api/v1/pipelines';

const LIST_SELECT = `${PIPELINE_SELECT}, pipeline_stages(id, pipeline_id, name, position, color)`;

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('pipelines')
      .select(LIST_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/pipelines] list error:', error);
      return fail('internal', 'Failed to list pipelines', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) =>
        serializePipeline(r as Record<string, unknown>, { includeStages: true })
      ),
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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return fail('bad_request', "'name' is required", 400);

    const stages = parseStagesInput(body.stages);
    if (stages === null) {
      return fail('bad_request', "'stages' must be an array of { name }", 400);
    }

    const userId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const { data, error } = await ctx.supabase
      .from('pipelines')
      .insert({
        account_id: ctx.accountId,
        user_id: userId,
        name,
      })
      .select(PIPELINE_SELECT)
      .single();

    if (error) {
      console.error('[api/v1/pipelines] create error:', error);
      return fail('internal', 'Failed to create pipeline', 500);
    }

    if (stages.length > 0) {
      const { error: stErr } = await ctx.supabase.from('pipeline_stages').insert(
        stages.map((s) => ({
          pipeline_id: data.id,
          name: s.name,
          position: s.position,
          color: s.color,
        }))
      );
      if (stErr) {
        console.error('[api/v1/pipelines] stages error:', stErr);
        return fail('internal', 'Failed to create pipeline stages', 500);
      }
    }

    const { data: full } = await ctx.supabase
      .from('pipelines')
      .select(LIST_SELECT)
      .eq('id', data.id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    return ok(
      serializePipeline((full ?? data) as Record<string, unknown>, {
        includeStages: true,
      }),
      201
    );
  } catch (err) {
    if (err instanceof ContactError) {
      return fail('internal', err.message, err.status);
    }
    return toApiErrorResponse(err);
  }
}
