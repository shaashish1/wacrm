// ============================================================
// GET /api/v1/campaigns/{id} — read one campaign (scope: campaigns:read)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { CAMPAIGN_SELECT, serializeCampaign } from '@/lib/api/v1/campaigns';

const GET_SELECT = `${CAMPAIGN_SELECT}, campaign_steps(id, position, channel, delay_hours, email_template_id, whatsapp_template_name, exit_on_reply), campaign_enrollments(count)`;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select(GET_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/campaigns] get error:', error);
      return fail('internal', 'Failed to read campaign', 500);
    }
    if (!data) return fail('not_found', 'Campaign not found', 404);
    return ok(
      serializeCampaign(data as Record<string, unknown>, { includeSteps: true })
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
