import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('contact_groups')
      .select('*, contact_group_members(count)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/contact-groups] error:', error);
      return NextResponse.json({ error: 'Failed to fetch contact groups' }, { status: 500 });
    }

    const shaped = data.map((g: any) => ({
      ...g,
      member_count: g.contact_group_members?.[0]?.count || 0,
      contact_group_members: undefined,
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
      .from('contact_groups')
      .insert({
        account_id: accountId,
        name: body.name,
        description: body.description || null,
        color: body.color || '#6366f1',
        is_smart: !!body.is_smart,
        smart_filter: body.smart_filter || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/contact-groups] error:', error);
      return NextResponse.json({ error: 'Failed to create contact group' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
