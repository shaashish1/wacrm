// ============================================================
// GET  /api/v1/campaigns — list campaigns (scope: campaigns:read)
// POST /api/v1/campaigns — create a draft (scope: campaigns:send)
//
// Create always persists status=draft and does not enroll or send.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import {
  CAMPAIGN_DETAIL_SELECT,
  createCampaign,
  serializeCampaign,
} from '@/lib/api/v1/campaigns';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:read');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('campaigns')
      .select(CAMPAIGN_DETAIL_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/campaigns] list error:', error);
      return fail('internal', 'Failed to list campaigns', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeCampaign(r as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:send');
    const body = await request.json().catch(() => null);
    const result = await createCampaign(ctx.supabase, {
      accountId: ctx.accountId,
      body,
    });
    if (!result.ok) {
      if (result.code === 'internal') {
        return fail('internal', result.message, 500);
      }
      return fail('bad_request', result.message, 400);
    }
    return ok(result.campaign, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
