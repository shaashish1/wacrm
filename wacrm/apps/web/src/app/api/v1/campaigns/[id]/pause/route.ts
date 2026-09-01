// ============================================================
// POST /api/v1/campaigns/{id}/pause — hold a campaign
// Scope: campaigns:send
//
// Sets the campaign to paused and clears next_send_at on active
// enrollments so the cron does not keep dequeuing. Does not send.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { pauseCampaign } from '@/lib/api/v1/campaigns';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:send');
    const { id } = await params;

    const result = await pauseCampaign(ctx.supabase, ctx.accountId, id);
    if (!result.ok) {
      if (result.code === 'not_found') {
        return fail('not_found', result.message, 404);
      }
      return fail('bad_request', result.message, 400);
    }

    return ok({
      status: result.status,
      paused_enrollments: result.paused_enrollments,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
