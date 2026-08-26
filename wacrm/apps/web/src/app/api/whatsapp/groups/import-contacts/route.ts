import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(req: Request) {
  try {
    const ctx = await requireRole('agent');
    const { participantIds } = (await req.json()) as {
      participantIds: string[];
    };

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: 'participantIds is required' },
        { status: 400 },
      );
    }

    const { data: participants, error: fetchErr } = await ctx.supabase
      .from('wa_group_participants')
      .select('phone, display_name, account_id')
      .in('id', participantIds)
      .eq('account_id', ctx.accountId)
      .not('phone', 'is', null);

    if (fetchErr) {
      console.error('[import-contacts]', fetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch participants' },
        { status: 500 },
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 });
    }

    const phones = participants.map((p) => p.phone!);
    const { data: existing } = await ctx.supabase
      .from('contacts')
      .select('phone')
      .in('phone', phones);

    const existingPhones = new Set((existing ?? []).map((c) => c.phone));

    const toInsert = participants
      .filter((p) => !existingPhones.has(p.phone!))
      .map((p) => ({
        phone: p.phone!,
        name: p.display_name || null,
        account_id: ctx.accountId,
        user_id: ctx.userId,
      }));

    let imported = 0;
    if (toInsert.length > 0) {
      const { error: insertErr, count } = await ctx.supabase
        .from('contacts')
        .insert(toInsert, { count: 'exact' });

      if (insertErr) {
        console.error('[import-contacts insert]', insertErr);
        return NextResponse.json(
          { error: 'Failed to import contacts' },
          { status: 500 },
        );
      }
      imported = count ?? toInsert.length;
    }

    return NextResponse.json({
      imported,
      skipped: participants.length - toInsert.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
