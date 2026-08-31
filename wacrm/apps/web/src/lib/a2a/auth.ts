import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRole } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/account';
import { requireApiKey } from '@/lib/auth/api-context';
import { looksLikeApiKey } from '@/lib/api-keys/keys';

export interface A2AAuthContext {
  supabase: SupabaseClient;
  accountId: string;
  userId: string | null;
  authType: 'session' | 'api_key';
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const value = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim();
  return value.length > 0 ? value : null;
}

/**
 * Session cookie (in-app) or API key with `a2a:invoke` (external).
 * GET cards use viewer+; JSON-RPC invoke uses agent+.
 */
export async function requireA2AAuth(
  request: Request,
  minRole: AccountRole,
): Promise<A2AAuthContext> {
  const token = bearerToken(request);
  if (token && looksLikeApiKey(token)) {
    const ctx = await requireApiKey(request, 'a2a:invoke');
    return {
      supabase: ctx.supabase,
      accountId: ctx.accountId,
      userId: ctx.createdBy,
      authType: 'api_key',
    };
  }
  const ctx = await requireRole(minRole);
  return {
    supabase: ctx.supabase,
    accountId: ctx.accountId,
    userId: ctx.userId,
    authType: 'session',
  };
}
