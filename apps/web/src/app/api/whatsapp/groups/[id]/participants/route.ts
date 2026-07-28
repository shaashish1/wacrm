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
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 },
      );
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

    const participants = data ?? [];
    const phones = participants
      .map((p) => p.phone)
      .filter(Boolean) as string[];

    const existingPhones = new Set<string>();
    if (phones.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < phones.length; i += CHUNK) {
        const chunk = phones.slice(i, i + CHUNK);
        const { data: existing } = await ctx.supabase
          .from('contacts')
          .select('phone')
          .eq('account_id', ctx.accountId)
          .in('phone', chunk);
        (existing ?? []).forEach((c) =>
          existingPhones.add(c.phone),
        );
      }
    }

    const enriched = participants.map((p) => ({
      ...p,
      in_crm: p.phone ? existingPhones.has(p.phone) : false,
    }));

    return NextResponse.json({ participants: enriched });
  } catch (err) {
    return toErrorResponse(err);
  }
}
