import { supabaseAdmin } from '@/lib/flows/admin-client';

export type BroadcastNotifyKind =
  | 'broadcast_sent'
  | 'broadcast_failed'
  | 'broadcast_scheduled';

/**
 * Notify the broadcast owner. service_role bypasses RLS; INSERT is
 * granted in migration 055. Failures are logged and never thrown —
 * a missing bell must not strand a send.
 */
export async function notifyBroadcastOwner(args: {
  accountId: string;
  userId: string;
  type: BroadcastNotifyKind;
  title: string;
  body: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from('notifications').insert({
    account_id: args.accountId,
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
  });
  if (error) {
    console.warn('[notify] failed to insert notification:', error.message);
  }
}
