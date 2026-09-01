// ============================================================
// GET    /api/v1/deals/{id} — read   (pipelines:read)
// PATCH  /api/v1/deals/{id} — update (pipelines:write)
// DELETE /api/v1/deals/{id} — delete (pipelines:write)
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { DEAL_SELECT, parseDealStatus, serializeDeal } from '@/lib/api/v1/pipelines';
import { PHI_REFUSE_MESSAGE, scanPhi } from '@/lib/a2a/phi';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('deals')
      .select(DEAL_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/deals] get error:', error);
      return fail('internal', 'Failed to read deal', 500);
    }
    if (!data) return fail('not_found', 'Deal not found', 404);
    return ok(serializeDeal(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from('deals')
      .select('id, pipeline_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!existing) return fail('not_found', 'Deal not found', 404);

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

    if ('title' in body) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return fail('bad_request', "'title' must be a non-empty string", 400);
      }
      updates.title = body.title.trim();
    }
    if ('value' in body) {
      const value =
        typeof body.value === 'number'
          ? body.value
          : typeof body.value === 'string'
            ? Number(body.value)
            : NaN;
      if (!Number.isFinite(value) || value < 0) {
        return fail('bad_request', "'value' must be a non-negative number", 400);
      }
      updates.value = value;
    }
    if ('currency' in body && typeof body.currency === 'string') {
      updates.currency = body.currency;
    }
    if ('notes' in body) {
      const notes =
        body.notes === null || typeof body.notes === 'string' ? body.notes : null;
      if (typeof notes === 'string') {
        const hits = scanPhi(notes);
        if (hits.length > 0) {
          return fail('phi_denied', PHI_REFUSE_MESSAGE, 400);
        }
      }
      updates.notes = notes;
    }
    if ('expected_close_date' in body) {
      updates.expected_close_date =
        typeof body.expected_close_date === 'string'
          ? body.expected_close_date
          : null;
    }
    if ('status' in body) {
      const status = parseDealStatus(body.status);
      if (!status) {
        return fail('bad_request', "'status' must be 'open', 'won', or 'lost'", 400);
      }
      updates.status = status;
    }
    if ('assigned_to' in body) {
      updates.assigned_to =
        typeof body.assigned_to === 'string' ? body.assigned_to : null;
    }
    if ('contact_id' in body) {
      if (body.contact_id === null) {
        updates.contact_id = null;
      } else if (typeof body.contact_id === 'string') {
        const { data: contact } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('id', body.contact_id)
          .eq('account_id', ctx.accountId)
          .maybeSingle();
        if (!contact) {
          return fail('bad_request', 'Contact not found in this account', 400);
        }
        updates.contact_id = contact.id;
      } else {
        return fail('bad_request', "'contact_id' must be a string or null", 400);
      }
    }
    if ('stage_id' in body) {
      if (typeof body.stage_id !== 'string') {
        return fail('bad_request', "'stage_id' must be a string", 400);
      }
      const { data: stage } = await ctx.supabase
        .from('pipeline_stages')
        .select('id')
        .eq('id', body.stage_id)
        .eq('pipeline_id', existing.pipeline_id)
        .maybeSingle();
      if (!stage) {
        return fail('bad_request', 'Stage does not belong to this pipeline', 400);
      }
      updates.stage_id = stage.id;
    }

    const { data, error } = await ctx.supabase
      .from('deals')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(DEAL_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/deals] update error:', error);
      return fail('internal', 'Failed to update deal', 500);
    }
    if (!data) return fail('not_found', 'Deal not found', 404);
    return ok(serializeDeal(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from('deals')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!existing) return fail('not_found', 'Deal not found', 404);

    const { error } = await ctx.supabase
      .from('deals')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[api/v1/deals] delete error:', error);
      return fail('internal', 'Failed to delete deal', 500);
    }

    return ok({ deleted: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
