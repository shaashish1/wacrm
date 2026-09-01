// ============================================================
// GET /api/v1/consents — list consent ledger rows (scope: consents:read)
//
// Filters: ?contact_id= ?channel=whatsapp|email ?status=active|revoked
// Read-only. Does not grant or backfill consent.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  parseListParams,
  keysetFilter,
  buildPage,
} from '@/lib/api/v1/pagination';
import { serializeConsent } from '@/lib/api/v1/consents';

const CONSENT_SELECT =
  'id, contact_id, phone_normalized, channel, source, granted_at, revoked_at, consent_text, created_at';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'consents:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);
    const contactId = url.searchParams.get('contact_id');
    const channel = url.searchParams.get('channel');
    const status = url.searchParams.get('status');

    if (channel && channel !== 'whatsapp' && channel !== 'email') {
      return fail('bad_request', "'channel' must be 'whatsapp' or 'email'", 400);
    }
    if (status && status !== 'active' && status !== 'revoked') {
      return fail('bad_request', "'status' must be 'active' or 'revoked'", 400);
    }

    let query = ctx.supabase
      .from('consents')
      .select(CONSENT_SELECT)
      .eq('account_id', ctx.accountId);

    if (contactId) query = query.eq('contact_id', contactId);
    if (channel) query = query.eq('channel', channel);
    if (status === 'active') query = query.is('revoked_at', null);
    if (status === 'revoked') query = query.not('revoked_at', 'is', null);

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/consents] list error:', error);
      return fail('internal', 'Failed to list consents', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeConsent(r as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
