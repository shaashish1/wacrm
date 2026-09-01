// ============================================================
// GET /api/v1/campaigns — list drip campaigns (scope: campaigns:read)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import { CAMPAIGN_SELECT, serializeCampaign } from '@/lib/api/v1/campaigns';

const LIST_SELECT = `${CAMPAIGN_SELECT}, campaign_steps(id, position, channel, delay_hours, email_template_id, whatsapp_template_name, exit_on_reply), campaign_enrollments(count)`;

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:read');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('campaigns')
      .select(LIST_SELECT)
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
