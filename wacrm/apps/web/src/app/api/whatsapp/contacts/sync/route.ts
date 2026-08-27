import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST() {
  try {
    const ctx = await requireRole('agent');
    const { wwebjsMessageQueue } = await import('@/lib/queue/bullmq');
    await wwebjsMessageQueue.add('sync-contacts', {
      accountId: ctx.accountId,
      action: 'syncContacts',
      payload: {},
    });
    return NextResponse.json({ queued: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
