// ============================================================
// GET    /api/v1/contact-groups/{id} — read  (contact-groups:read)
// PATCH  /api/v1/contact-groups/{id} — update (contact-groups:write)
// DELETE /api/v1/contact-groups/{id} — delete (contact-groups:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { serializeContactGroup } from '@/lib/api/v1/groups';

const GROUP_SELECT =
  'id, name, description, color, is_smart, smart_filter, created_at, updated_at, contact_group_members(count)';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('contact_groups')
      .select(GROUP_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/contact-groups] get error:', error);
      return fail('internal', 'Failed to read contact group', 500);
    }
    if (!data) return fail('not_found', 'Contact group not found', 404);
    return ok(serializeContactGroup(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:write');
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return fail('bad_request', "'name' must be a non-empty string", 400);
      }
      updates.name = body.name.trim();
    }
    if ('description' in body) {
      updates.description =
        body.description === null || typeof body.description === 'string'
          ? body.description
          : null;
    }
    if ('color' in body && typeof body.color === 'string') {
      updates.color = body.color;
    }
    if ('is_smart' in body) updates.is_smart = Boolean(body.is_smart);
    if ('smart_filter' in body) {
      updates.smart_filter =
        body.smart_filter && typeof body.smart_filter === 'object'
          ? body.smart_filter
          : null;
    }

    const { data, error } = await ctx.supabase
      .from('contact_groups')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(GROUP_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/contact-groups] update error:', error);
      return fail('internal', 'Failed to update contact group', 500);
    }
    if (!data) return fail('not_found', 'Contact group not found', 404);
    return ok(serializeContactGroup(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'contact-groups:write');
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from('contact_groups')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (!existing) return fail('not_found', 'Contact group not found', 404);

    const { error } = await ctx.supabase
      .from('contact_groups')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[api/v1/contact-groups] delete error:', error);
      return fail('internal', 'Failed to delete contact group', 500);
    }

    return ok({ deleted: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
