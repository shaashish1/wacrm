// ============================================================
// GET  /api/v1/landings — list (scope: landings:read)
// POST /api/v1/landings — create (scope: landings:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import {
  LANDING_SELECT,
  createLanding,
  serializeLanding,
} from '@/lib/api/v1/landings';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'landings:read');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('landing_pages')
      .select(LANDING_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/landings] list error:', error);
      return fail('internal', 'Failed to list landings', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeLanding(r as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'landings:write');
    const body = await request.json().catch(() => null);
    const result = await createLanding(ctx.supabase, {
      accountId: ctx.accountId,
      body,
    });
    if (!result.ok) {
      if (result.code === 'conflict') {
        return fail('conflict', result.message, 409);
      }
      if (result.code === 'internal') {
        return fail('internal', result.message, 500);
      }
      return fail('bad_request', result.message, 400);
    }
    return ok(result.landing, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
