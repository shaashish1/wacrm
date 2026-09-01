// ============================================================
// GET /api/v1/campaigns/{id}/enrollments — list enrollments
// Scope: campaigns:read
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilterOn,
  buildPage,
} from '@/lib/api/v1/pagination';
import {
  ENROLLMENT_SELECT,
  serializeEnrollment,
} from '@/lib/api/v1/campaigns';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:read');
    const { id } = await params;
    const { limit, cursor } = parseListParams(request);

    const { data: campaign } = await ctx.supabase
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!campaign) return fail('not_found', 'Campaign not found', 404);

    let query = ctx.supabase
      .from('campaign_enrollments')
      .select(ENROLLMENT_SELECT)
      .eq('campaign_id', id)
      .order('enrolled_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilterOn(cursor, 'enrolled_at');
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/campaigns] enrollments error:', error);
      return fail('internal', 'Failed to list enrollments', 500);
    }

    const rows = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
    const pageRows = rows.map((r) => ({
      ...r,
      created_at:
        (r.enrolled_at as string | null) ?? '1970-01-01T00:00:00.000Z',
    }));
    const { items, nextCursor } = buildPage(pageRows, limit);
    return okList(
      items.map((r) => serializeEnrollment(r)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
