// ============================================================
// GET /api/v1/wa-groups — list WhatsApp groups (scope: groups:read)
//
// Keyset-paginated on (synced_at, id) descending. Optional
// `?search=` matches subject.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilterOn,
  buildPage,
} from '@/lib/api/v1/pagination';
import { serializeWaGroup } from '@/lib/api/v1/groups';

const WA_GROUP_SELECT =
  'id, jid, subject, description, size, is_community, announce, restrict, synced_at';

function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim();
}

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'groups:read');
    const { limit, cursor } = parseListParams(request);
    const search = sanitizeSearch(
      new URL(request.url).searchParams.get('search') ?? ''
    );

    let query = ctx.supabase
      .from('wa_groups')
      .select(WA_GROUP_SELECT)
      .eq('account_id', ctx.accountId);

    if (search) {
      query = query.ilike('subject', `%${search}%`);
    }

    query = query
      .order('synced_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilterOn(cursor, 'synced_at');
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/wa-groups] list error:', error);
      return fail('internal', 'Failed to list WhatsApp groups', 500);
    }

    const rows = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
    const pageRows = rows.map((r) => ({
      ...r,
      id: r.id,
      created_at: (r.synced_at as string | null) ?? '1970-01-01T00:00:00.000Z',
    }));
    const { items, nextCursor } = buildPage(pageRows, limit);
    return okList(items.map((r) => serializeWaGroup(r)), nextCursor);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
