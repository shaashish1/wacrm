import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Persist first-source Group ID (never clobber) and a membership row
 * so subject renames do not lose lineage.
 */
export async function attachContactGroupLineage(
  db: SupabaseClient,
  accountId: string,
  contactIds: string[],
  groupId: string | null,
): Promise<void> {
  if (!groupId || contactIds.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const slice = contactIds.slice(i, i + CHUNK);
    await db
      .from('contacts')
      .update({ source_group_id: groupId })
      .eq('account_id', accountId)
      .in('id', slice)
      .is('source_group_id', null);

    const rows = slice.map((contact_id) => ({
      contact_id,
      group_id: groupId,
      account_id: accountId,
    }));
    await db.from('contact_wa_groups').upsert(rows, {
      onConflict: 'contact_id,group_id',
      ignoreDuplicates: true,
    });
  }
}
