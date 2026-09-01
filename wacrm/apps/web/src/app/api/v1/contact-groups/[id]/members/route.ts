// ============================================================
// GET    /api/v1/contact-groups/{id}/members — list contact ids
// POST   /api/v1/contact-groups/{id}/members — add { contact_ids }
// DELETE /api/v1/contact-groups/{id}/members — remove { contact_ids }
//
// Smart groups cannot be mutated. Writes require contact-groups:write.
// Contacts must belong to the same account.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams, buildPage } from '@/lib/api/v1/pagination';
import { parseContactIds } from '@/lib/api/v1/groups';

type Params = { params: Promise<{ id: string }> };

async function loadGroup(
  supabase: SupabaseClient,
  accountId: string,
  id: string
) {
  const { data } = await supabase
    .from('contact_groups')
    .select('id, is_smart')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  return data;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:read');
    const { id } = await params;
    const { limit, cursor } = parseListParams(request);

    const group = await loadGroup(ctx.supabase, ctx.accountId, id);
    if (!group) return fail('not_found', 'Contact group not found', 404);

    const { data, error } = await ctx.supabase.rpc('resolve_group_members', {
      p_group_id: id,
    });
    if (error) {
      console.error('[api/v1/contact-groups] members error:', error);
      return fail('internal', 'Failed to list group members', 500);
    }

    const ids = (data ?? [])
      .map((d: { contact_id: string }) => d.contact_id)
      .filter((cid: string) => typeof cid === 'string')
      .sort()
      .reverse();

    const start = cursor
      ? ids.findIndex((cid: string) => cid < cursor.id)
      : 0;
    const sliceStart = start < 0 ? ids.length : start;
    const page = ids.slice(sliceStart, sliceStart + limit + 1);
    const { items, nextCursor } = buildPage(
      page.map((cid: string) => ({
        id: cid,
        created_at: '1970-01-01T00:00:00.000Z',
      })),
      limit
    );

    return okList(
      items.map((r) => ({ contact_id: r.id })),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:write');
    const { id } = await params;

    const group = await loadGroup(ctx.supabase, ctx.accountId, id);
    if (!group) return fail('not_found', 'Contact group not found', 404);
    if (group.is_smart) {
      return fail(
        'bad_request',
        'Cannot manually add members to a smart group',
        400
      );
    }

    const contactIds = parseContactIds(await request.json().catch(() => null));
    if (!contactIds || contactIds.length === 0) {
      return fail('bad_request', "'contact_ids' must be a non-empty array", 400);
    }

    const { data: owned } = await ctx.supabase
      .from('contacts')
      .select('id')
      .eq('account_id', ctx.accountId)
      .in('id', contactIds);
    const ownedIds = new Set((owned ?? []).map((c) => c.id as string));
    const inserts = contactIds
      .filter((cid) => ownedIds.has(cid))
      .map((contact_id) => ({ group_id: id, contact_id }));

    if (inserts.length === 0) {
      return fail(
        'bad_request',
        'No listed contacts belong to this account',
        400
      );
    }

    const { error } = await ctx.supabase
      .from('contact_group_members')
      .insert(inserts);
    if (error && error.code !== '23505') {
      console.error('[api/v1/contact-groups] add members error:', error);
      return fail('internal', 'Failed to add members', 500);
    }

    return ok({ added: inserts.length }, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:write');
    const { id } = await params;

    const group = await loadGroup(ctx.supabase, ctx.accountId, id);
    if (!group) return fail('not_found', 'Contact group not found', 404);
    if (group.is_smart) {
      return fail(
        'bad_request',
        'Cannot manually remove members from a smart group',
        400
      );
    }

    const contactIds = parseContactIds(await request.json().catch(() => null));
    if (!contactIds || contactIds.length === 0) {
      return fail('bad_request', "'contact_ids' must be a non-empty array", 400);
    }

    const { error } = await ctx.supabase
      .from('contact_group_members')
      .delete()
      .eq('group_id', id)
      .in('contact_id', contactIds);

    if (error) {
      console.error('[api/v1/contact-groups] remove members error:', error);
      return fail('internal', 'Failed to remove members', 500);
    }

    return ok({ removed: contactIds.length });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
