// ============================================================
// GET /api/v1/wa-groups/{id} — read one WhatsApp group
// Scope: groups:read. Another account's group → 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { serializeWaGroup } from '@/lib/api/v1/groups';

const WA_GROUP_SELECT =
  'id, jid, subject, description, size, is_community, announce, restrict, synced_at';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'groups:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('wa_groups')
      .select(WA_GROUP_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/wa-groups] get error:', error);
      return fail('internal', 'Failed to read WhatsApp group', 500);
    }
    if (!data) return fail('not_found', 'WhatsApp group not found', 404);
    return ok(serializeWaGroup(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
