import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { enrollCampaignContacts } from '@/lib/api/v1/campaigns';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    const result = await enrollCampaignContacts(supabase, {
      accountId,
      campaignId: id,
    });

    if (!result.ok) {
      const status =
        result.code === 'not_found' ? 404 : 400;
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      enrolled: result.enrolled,
      skipped_no_consent: result.skipped_no_consent,
      already_enrolled: result.already_enrolled,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
