import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { PHI_REFUSE_MESSAGE, scanPhi } from '@/lib/a2a/phi';

/**
 * POST /api/contacts/[id]/notes — agent+ contact note.
 * PHI deny-list is enforced here (the dashboard used to insert
 * `contact_notes` from the browser, which skipped the scan).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => null)) as {
      note_text?: unknown;
    } | null;
    const noteText =
      typeof body?.note_text === 'string' ? body.note_text.trim() : '';
    if (!noteText) {
      return NextResponse.json({ error: 'note_text is required' }, { status: 400 });
    }

    const hits = scanPhi(noteText);
    if (hits.length > 0) {
      return NextResponse.json(
        { error: PHI_REFUSE_MESSAGE, code: 'phi_denied', violations: hits },
        { status: 400 }
      );
    }

    const { data: contact } = await ctx.supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { data, error } = await ctx.supabase
      .from('contact_notes')
      .insert({
        contact_id: contactId,
        account_id: ctx.accountId,
        user_id: ctx.userId,
        note_text: noteText,
      })
      .select('id, note_text, created_at')
      .single();
    if (error || !data) {
      console.error('[contacts/notes] insert failed:', error);
      return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
