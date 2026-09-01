// ============================================================
// POST /api/v1/campaigns/{id}/enroll — consent-gated enroll
// Scope: campaigns:send
//
// Body: { "contact_ids": ["…"] } or omit to enroll the campaign's
// contact-group audience. Does not send WhatsApp. Contacts without
// an active consent row (or opted out) are skipped; an empty
// eligible set is refused. The campaign cron is the send path.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  enrollCampaignContacts,
  parseEnrollContactIds,
} from '@/lib/api/v1/campaigns';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'campaigns:send');
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const contactIds = parseEnrollContactIds(body);
    if (contactIds === null) {
      return fail('bad_request', "'contact_ids' must be an array of ids", 400);
    }

    const result = await enrollCampaignContacts(ctx.supabase, {
      accountId: ctx.accountId,
      campaignId: id,
      contactIds,
    });

    if (!result.ok) {
      if (result.code === 'not_found') {
        return fail('not_found', result.message, 404);
      }
      if (result.code === 'no_consent') {
        return fail('no_consent', result.message, 400);
      }
      return fail('bad_request', result.message, 400);
    }

    return ok(
      {
        enrolled: result.enrolled,
        skipped_no_consent: result.skipped_no_consent,
        already_enrolled: result.already_enrolled,
        campaign_status: result.campaign_status,
      },
      202
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
