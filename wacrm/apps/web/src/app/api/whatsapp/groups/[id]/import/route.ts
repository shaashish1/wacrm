import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { attachContactGroupLineage } from '@/lib/wa-groups/lineage';

export async function POST(
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

    const admin = supabaseAdmin();
    const { data: participants, error: fetchErr } = await admin
      .from('wa_group_participants')
      .select('phone, display_name')
      .eq('group_id', id)
      .eq('account_id', ctx.accountId)
      .not('phone', 'is', null);

    if (fetchErr) {
      console.error('[group import]', fetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch participants' },
        { status: 500 },
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 });
    }

    const phones = participants.map((p) => p.phone!);

    const { data: existing } = await admin
      .from('contacts')
      .select('phone')
      .eq('account_id', ctx.accountId)
      .in('phone', phones);

    const existingPhones = new Set((existing ?? []).map((c) => c.phone));

    const toInsert = participants
      .filter((p) => !existingPhones.has(p.phone!))
      .map((p) => ({
        phone: p.phone!,
        name: p.display_name || null,
        source_group_id: id,
        account_id: ctx.accountId,
        user_id: ctx.userId,
      }));

    let imported = 0;
    if (toInsert.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error: insertErr } = await admin
          .from('contacts')
          .insert(chunk);
        if (insertErr) {
          console.error('[group import chunk]', insertErr);
        } else {
          imported += chunk.length;
        }
      }
    }

    const { data: contactRows } = await admin
      .from('contacts')
      .select('id')
      .eq('account_id', ctx.accountId)
      .in('phone', phones);
    await attachContactGroupLineage(
      admin,
      ctx.accountId,
      (contactRows ?? []).map((c) => c.id),
      id,
    );

    return NextResponse.json({
      imported,
      skipped: participants.length - toInsert.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
