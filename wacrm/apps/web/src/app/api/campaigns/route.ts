import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('campaigns')
      .select('*, campaign_steps(*), campaign_enrollments(count)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    const shaped = data.map((c: any) => ({
      ...c,
      enrollments_count: c.campaign_enrollments?.[0]?.count || 0,
      campaign_enrollments: undefined,
    }));

    return NextResponse.json({ data: shaped });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');

    const body = await request.json().catch(() => null);
    if (!body || !body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        account_id: accountId,
        name: body.name,
        channel: body.channel || 'email',
        status: body.status || 'draft',
        audience_type: body.audience_type || 'group',
        audience_group_id: body.audience_group_id || null,
        audience_filter: body.audience_filter || null,
        trigger_type: body.trigger_type || 'manual',
        trigger_config: body.trigger_config || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
