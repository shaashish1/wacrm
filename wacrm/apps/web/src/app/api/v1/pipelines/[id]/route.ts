// ============================================================
// GET    /api/v1/pipelines/{id} — read   (pipelines:read)
// PATCH  /api/v1/pipelines/{id} — rename (pipelines:write)
// DELETE /api/v1/pipelines/{id} — delete (pipelines:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { PIPELINE_SELECT, serializePipeline } from '@/lib/api/v1/pipelines';

const GET_SELECT = `${PIPELINE_SELECT}, pipeline_stages(id, pipeline_id, name, position, color)`;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('pipelines')
      .select(GET_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/pipelines] get error:', error);
      return fail('internal', 'Failed to read pipeline', 500);
    }
    if (!data) return fail('not_found', 'Pipeline not found', 404);
    return ok(
      serializePipeline(data as Record<string, unknown>, { includeStages: true })
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const updates: Record<string, unknown> = {};
    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return fail('bad_request', "'name' must be a non-empty string", 400);
      }
      updates.name = body.name.trim();
    }
    if (Object.keys(updates).length === 0) {
      return fail('bad_request', 'No updatable fields provided', 400);
    }

    const { data, error } = await ctx.supabase
      .from('pipelines')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(GET_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/pipelines] update error:', error);
      return fail('internal', 'Failed to update pipeline', 500);
    }
    if (!data) return fail('not_found', 'Pipeline not found', 404);
    return ok(
      serializePipeline(data as Record<string, unknown>, { includeStages: true })
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!existing) return fail('not_found', 'Pipeline not found', 404);

    const { error } = await ctx.supabase
      .from('pipelines')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[api/v1/pipelines] delete error:', error);
      return fail('internal', 'Failed to delete pipeline', 500);
    }

    return ok({ deleted: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
