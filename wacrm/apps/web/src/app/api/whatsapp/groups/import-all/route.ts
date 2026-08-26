import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function POST() {
  try {
    const ctx = await requireRole('agent');
    const admin = supabaseAdmin();

    let allParticipants: { phone: string; display_name: string | null }[] =
      [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await admin
        .from('wa_group_participants')
        .select('phone, display_name')
        .eq('account_id', ctx.accountId)
        .not('phone', 'is', null)
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.error('[import-all] fetch error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch participants' },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      allParticipants = allParticipants.concat(data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    if (allParticipants.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 });
    }

    const normalize = (ph: string) => ph.replace(/\D/g, '');
    const uniqueByNorm = new Map<
      string,
      { phone: string; display_name: string | null }
    >();
    for (const p of allParticipants) {
      if (p.phone) {
        const norm = normalize(p.phone);
        if (!uniqueByNorm.has(norm)) {
          uniqueByNorm.set(norm, {
            phone: p.phone,
            display_name: p.display_name,
          });
        }
      }
    }

    const existingNorm = new Set<string>();
    const allRawPhones = [...uniqueByNorm.values()].map((p) => p.phone);
    const QUERY_CHUNK = 1000;
    for (let i = 0; i < allRawPhones.length; i += QUERY_CHUNK) {
      const chunk = allRawPhones.slice(i, i + QUERY_CHUNK);
      const { data: existing } = await admin
        .from('contacts')
        .select('phone')
        .eq('account_id', ctx.accountId)
        .in('phone', chunk);
      (existing ?? []).forEach((c) =>
        existingNorm.add(normalize(c.phone)),
      );
    }

    const toInsert = [...uniqueByNorm.entries()]
      .filter(([norm]) => !existingNorm.has(norm))
      .map(([, p]) => ({
        phone: p.phone,
        name: p.display_name || null,
        account_id: ctx.accountId,
        user_id: ctx.userId,
      }));

    let imported = 0;
    let dupeSkipped = 0;
    const INSERT_CHUNK = 100;
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { error: insertErr } = await admin
        .from('contacts')
        .insert(chunk);
      if (insertErr) {
        for (const row of chunk) {
          const { error: singleErr } = await admin
            .from('contacts')
            .insert(row);
          if (singleErr) dupeSkipped++;
          else imported++;
        }
      } else {
        imported += chunk.length;
      }
    }

    return NextResponse.json({
      imported,
      skipped: existingNorm.size + dupeSkipped,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
