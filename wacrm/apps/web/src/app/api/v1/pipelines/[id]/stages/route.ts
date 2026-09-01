// ============================================================
// GET  /api/v1/pipelines/{id}/stages — list  (pipelines:read)
// POST /api/v1/pipelines/{id}/stages — create (pipelines:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { STAGE_SELECT, serializePipelineStage } from '@/lib/api/v1/pipelines';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { id } = await params;

    const { data: pipeline } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!pipeline) return fail('not_found', 'Pipeline not found', 404);

    const { data, error } = await ctx.supabase
      .from('pipeline_stages')
      .select(STAGE_SELECT)
      .eq('pipeline_id', id)
      .order('position', { ascending: true });

    if (error) {
      console.error('[api/v1/pipelines] stages list error:', error);
      return fail('internal', 'Failed to list stages', 500);
    }

    return okList(
      (data ?? []).map((r) => serializePipelineStage(r as Record<string, unknown>)),
      null
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;

    const { data: pipeline } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!pipeline) return fail('not_found', 'Pipeline not found', 404);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return fail('bad_request', "'name' is required", 400);

    let position = 0;
    if (typeof body.position === 'number' && Number.isFinite(body.position)) {
      position = body.position;
    } else {
      const { data: last } = await ctx.supabase
        .from('pipeline_stages')
        .select('position')
        .eq('pipeline_id', id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      position = typeof last?.position === 'number' ? last.position + 1 : 0;
    }

    const { data, error } = await ctx.supabase
      .from('pipeline_stages')
      .insert({
        pipeline_id: id,
        name,
        position,
        color: typeof body.color === 'string' ? body.color : '#3b82f6',
      })
      .select(STAGE_SELECT)
      .single();

    if (error) {
      console.error('[api/v1/pipelines] stage create error:', error);
      return fail('internal', 'Failed to create stage', 500);
    }

    return ok(serializePipelineStage(data as Record<string, unknown>), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
