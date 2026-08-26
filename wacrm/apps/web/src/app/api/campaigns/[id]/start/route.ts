import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    // Fetch the campaign
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('id, audience_type, audience_group_id, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (cErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      return NextResponse.json({ error: 'Campaign is already active or completed' }, { status: 400 });
    }

    // Resolve audience members
    let contactIds: string[] = [];

    if (campaign.audience_type === 'group' && campaign.audience_group_id) {
      const { data: members, error: mErr } = await supabase
        .rpc('resolve_group_members', { p_group_id: campaign.audience_group_id });
      
      if (!mErr && members) {
        contactIds = members.map((m: any) => m.contact_id);
      }
    } else {
       return NextResponse.json({ error: 'Only group audience types are supported right now' }, { status: 400 });
    }

    if (contactIds.length === 0) {
      return NextResponse.json({ error: 'No contacts in audience to enroll' }, { status: 400 });
    }

    // Insert enrollments ignoring conflicts (if already enrolled)
    const enrollments = contactIds.map(cId => ({
      campaign_id: id,
      contact_id: cId,
      current_step: 1,
      status: 'active',
      next_send_at: new Date().toISOString(), // send first step immediately
    }));

    const { error: enrollErr } = await supabase
      .from('campaign_enrollments')
      .upsert(enrollments, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });

    if (enrollErr) throw enrollErr;

    // Update campaign status
    const { error: upErr } = await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', id);

    if (upErr) throw upErr;

    return NextResponse.json({ success: true, enrolled: enrollments.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
