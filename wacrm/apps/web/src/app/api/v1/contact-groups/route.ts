// ============================================================
// GET  /api/v1/contact-groups — list (scope: contact-groups:read)
// POST /api/v1/contact-groups — create (scope: contact-groups:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import { serializeContactGroup } from '@/lib/api/v1/groups';

const GROUP_SELECT =
  'id, name, description, color, is_smart, smart_filter, created_at, updated_at, contact_group_members(count)';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:read');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('contact_groups')
      .select(GROUP_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/contact-groups] list error:', error);
      return fail('internal', 'Failed to list contact groups', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeContactGroup(r as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:write');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return fail('bad_request', "'name' is required", 400);

    const { data, error } = await ctx.supabase
      .from('contact_groups')
      .insert({
        account_id: ctx.accountId,
        name,
        description:
          typeof body.description === 'string' ? body.description : null,
        color: typeof body.color === 'string' ? body.color : '#6366f1',
        is_smart: Boolean(body.is_smart),
        smart_filter:
          body.smart_filter && typeof body.smart_filter === 'object'
            ? body.smart_filter
            : null,
      })
      .select(GROUP_SELECT)
      .single();

    if (error) {
      console.error('[api/v1/contact-groups] create error:', error);
      return fail('internal', 'Failed to create contact group', 500);
    }

    return ok(serializeContactGroup(data as Record<string, unknown>), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
