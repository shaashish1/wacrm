import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;

    const { data: group } = await ctx.supabase
      .from('wa_groups')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data, error } = await ctx.supabase
      .from('wa_group_participants')
      .select('*')
      .eq('group_id', id)
      .order('display_name', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[participants GET]', error);
      return NextResponse.json(
        { error: 'Failed to fetch participants' },
        { status: 500 },
      );
    }

    return NextResponse.json({ participants: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
