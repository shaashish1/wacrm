import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const { data, error } = await ctx.supabase
      .from('wa_groups')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('subject', { ascending: true });

    if (error) {
      console.error('[groups GET]', error);
      return NextResponse.json(
        { error: 'Failed to fetch groups' },
        { status: 500 },
      );
    }

    return NextResponse.json({ groups: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST() {
  try {
    const ctx = await requireRole('admin');

    const { wwebjsMessageQueue } = await import('@/lib/queue/bullmq');
    await wwebjsMessageQueue.add('sync-groups', {
      accountId: ctx.accountId,
      action: 'syncGroups',
      payload: {},
    });

    return NextResponse.json({ queued: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
