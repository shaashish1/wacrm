import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { id } = await params;

    const { data, error } = await supabase
      .from('campaigns')
      .select('*, campaign_steps(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // order steps by position
    if (data.campaign_steps) {
      data.campaign_steps.sort((a: any, b: any) => a.position - b.position);
    }

    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;
    
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if ('name' in body) updates.name = body.name;
    if ('status' in body) updates.status = body.status;
    if ('channel' in body) updates.channel = body.channel;
    if ('audience_type' in body) updates.audience_type = body.audience_type;
    if ('audience_group_id' in body) updates.audience_group_id = body.audience_group_id;
    if ('audience_filter' in body) updates.audience_filter = body.audience_filter;
    if ('trigger_type' in body) updates.trigger_type = body.trigger_type;
    if ('trigger_config' in body) updates.trigger_config = body.trigger_config;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (Array.isArray(body.steps)) {
      await supabase.from('campaign_steps').delete().eq('campaign_id', id);
      if (body.steps.length > 0) {
        const rows = body.steps.map((s: Record<string, unknown>, i: number) => ({
          campaign_id: id,
          position: typeof s.position === 'number' ? s.position : i + 1,
          channel: s.channel === 'whatsapp' ? 'whatsapp' : 'email',
          delay_hours: Number(s.delay_hours) || 0,
          whatsapp_template_name: s.whatsapp_template_name ?? s.body_text ?? null,
          email_template_id: s.email_template_id ?? null,
          exit_on_reply: s.exit_on_reply !== false,
        }));
        const { error: stepsErr } = await supabase.from('campaign_steps').insert(rows);
        if (stepsErr) throw stepsErr;
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
