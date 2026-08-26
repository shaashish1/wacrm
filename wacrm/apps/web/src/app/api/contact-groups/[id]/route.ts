import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { id } = await params;

    const { data, error } = await supabase
      .from('contact_groups')
      .select('*, contact_group_members(count)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const shaped = {
      ...data,
      member_count: data.contact_group_members?.[0]?.count || 0,
      contact_group_members: undefined,
    };

    return NextResponse.json({ data: shaped });
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
    if ('description' in body) updates.description = body.description;
    if ('color' in body) updates.color = body.color;
    if ('is_smart' in body) updates.is_smart = body.is_smart;
    if ('smart_filter' in body) updates.smart_filter = body.smart_filter;

    const { data, error } = await supabase
      .from('contact_groups')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
      .from('contact_groups')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
