// ============================================================
// GET /api/v1/consents/{id} — read one consent row
// Scope: consents:read. Another account's row → 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { serializeConsent } from '@/lib/api/v1/consents';

const CONSENT_SELECT =
  'id, contact_id, phone_normalized, channel, source, granted_at, revoked_at, consent_text, created_at';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'consents:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('consents')
      .select(CONSENT_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/consents] get error:', error);
      return fail('internal', 'Failed to read consent', 500);
    }
    if (!data) return fail('not_found', 'Consent not found', 404);
    return ok(serializeConsent(data as Record<string, unknown>));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
