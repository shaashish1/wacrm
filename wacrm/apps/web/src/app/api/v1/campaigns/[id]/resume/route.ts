// ============================================================
// POST /api/v1/campaigns/{id}/resume — return enrollments to cron
// Scope: campaigns:send
//
// Does not send WhatsApp. Thaws paused enrollments that still have
// consent and sets the campaign active so `/api/campaigns/cron` can
// dequeue them. Empty eligible set → no_consent.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resumeCampaign } from '@/lib/api/v1/campaigns';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:send');
    const { id } = await params;

    const result = await resumeCampaign(ctx.supabase, ctx.accountId, id);
    if (!result.ok) {
      if (result.code === 'not_found') {
        return fail('not_found', result.message, 404);
      }
      if (result.code === 'no_consent') {
        return fail('no_consent', result.message, 400);
      }
      return fail('bad_request', result.message, 400);
    }

    return ok({
      status: result.status,
      resumed: result.resumed,
      skipped_no_consent: result.skipped_no_consent,
      campaign_status: result.campaign_status,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
