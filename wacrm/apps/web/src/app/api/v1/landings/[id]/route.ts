// ============================================================
// GET   /api/v1/landings/{id} — read   (landings:read)
// PATCH /api/v1/landings/{id} — update (landings:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  LANDING_SELECT,
  serializeLanding,
  updateLanding,
} from '@/lib/api/v1/landings';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'landings:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('landing_pages')
      .select(LANDING_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/landings] get error:', error);
      return fail('internal', 'Failed to read landing', 500);
    }
    if (!data) return fail('not_found', 'Landing not found', 404);
    return ok(serializeLanding(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'landings:write');
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const result = await updateLanding(ctx.supabase, {
      accountId: ctx.accountId,
      landingId: id,
      body,
    });
    if (!result.ok) {
      if (result.code === 'not_found') {
        return fail('not_found', result.message, 404);
      }
      if (result.code === 'conflict') {
        return fail('conflict', result.message, 409);
      }
      if (result.code === 'internal') {
        return fail('internal', result.message, 500);
      }
      return fail('bad_request', result.message, 400);
    }
    return ok(result.landing);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
