// ============================================================
// POST /api/v1/wa-groups/sync — enqueue Baileys group sync
// Scope: groups:admin
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, toApiErrorResponse } from '@/lib/api/v1/respond';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'groups:admin');

    const { wwebjsMessageQueue } = await import('@/lib/queue/bullmq');
    await wwebjsMessageQueue.add('sync-groups', {
      accountId: ctx.accountId,
      action: 'syncGroups',
      payload: {},
    });

    return ok({ queued: true }, 202);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
