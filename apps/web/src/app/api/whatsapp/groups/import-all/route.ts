import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function POST() {
  try {
    const ctx = await requireRole('agent');
    const admin = supabaseAdmin();

    const { data: participants, error: fetchErr } = await admin
      .from('wa_group_participants')
      .select('phone, display_name')
      .eq('account_id', ctx.accountId)
      .not('phone', 'is', null);

    if (fetchErr) {
      console.error('[import-all]', fetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch participants' },
        { status: 500 },
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 });
    }

    const uniqueByPhone = new Map<
      string,
      { phone: string; display_name: string | null }
    >();
    for (const p of participants) {
      if (p.phone && !uniqueByPhone.has(p.phone)) {
        uniqueByPhone.set(p.phone, {
          phone: p.phone,
          display_name: p.display_name,
        });
      }
    }

    const allPhones = [...uniqueByPhone.keys()];

    const existingPhones = new Set<string>();
    const QUERY_CHUNK = 1000;
    for (let i = 0; i < allPhones.length; i += QUERY_CHUNK) {
      const chunk = allPhones.slice(i, i + QUERY_CHUNK);
      const { data: existing } = await admin
        .from('contacts')
        .select('phone')
        .eq('account_id', ctx.accountId)
        .in('phone', chunk);
      (existing ?? []).forEach((c) => existingPhones.add(c.phone));
    }

    const toInsert = [...uniqueByPhone.values()]
      .filter((p) => !existingPhones.has(p.phone))
      .map((p) => ({
        phone: p.phone,
        name: p.display_name || null,
        account_id: ctx.accountId,
        user_id: ctx.userId,
      }));

    let imported = 0;
    const INSERT_CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { error: insertErr } = await admin
        .from('contacts')
        .insert(chunk);
      if (insertErr) {
        console.error('[import-all chunk]', insertErr);
      } else {
        imported += chunk.length;
      }
    }

    return NextResponse.json({
      imported,
      skipped: uniqueByPhone.size - toInsert.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
