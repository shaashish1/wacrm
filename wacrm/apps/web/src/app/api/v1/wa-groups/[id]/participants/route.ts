// ============================================================
// GET /api/v1/wa-groups/{id}/participants
// Scope: groups:read. Paginated by id descending.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams, buildPage } from '@/lib/api/v1/pagination';
import { serializeWaParticipant } from '@/lib/api/v1/groups';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'groups:read');
    const { id } = await params;
    const { limit, cursor } = parseListParams(request);

    const { data: group } = await ctx.supabase
      .from('wa_groups')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (!group) return fail('not_found', 'WhatsApp group not found', 404);

    let query = ctx.supabase
      .from('wa_group_participants')
      .select('id, group_id, jid, phone, display_name, is_admin, is_super_admin')
      .eq('group_id', id)
      .eq('account_id', ctx.accountId)
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('id', cursor.id);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/wa-groups] participants error:', error);
      return fail('internal', 'Failed to list group participants', 500);
    }

    const rows = (data ?? []) as Array<
      Record<string, unknown> & { id: string; phone: string | null }
    >;
    const phones = rows
      .map((p) => p.phone)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);

    const existingPhones = new Set<string>();
    if (phones.length > 0) {
      const { data: existing } = await ctx.supabase
        .from('contacts')
        .select('phone')
        .eq('account_id', ctx.accountId)
        .in('phone', phones);
      for (const c of existing ?? []) {
        if (c.phone) existingPhones.add(c.phone);
      }
    }

    const paged = rows.map((r) => ({
      ...r,
      id: r.id,
      created_at: '1970-01-01T00:00:00.000Z',
    }));
    const { items, nextCursor } = buildPage(paged, limit);
    return okList(
      items.map((r) =>
        serializeWaParticipant(
          r,
          typeof r.phone === 'string' && existingPhones.has(r.phone)
        )
      ),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
