import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

type Params = { params: Promise<{ id: string }> };

function parseContactIds(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('contactIds' in body)) return [];
  const raw = (body as { contactIds: unknown }).contactIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { id } = await params;

    // Use the RPC to resolve members dynamically
    const { data, error } = await supabase
      .rpc('resolve_group_members', { p_group_id: id });

    if (error) throw error;

    return NextResponse.json({ data: data.map((d: any) => d.contact_id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    const contactIds = parseContactIds(await request.json().catch(() => null));
    if (contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds array required' }, { status: 400 });
    }

    // Must verify group exists and belongs to account
    const { data: group } = await supabase.from('contact_groups').select('id, is_smart').eq('id', id).eq('account_id', accountId).maybeSingle();
    
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (group.is_smart) return NextResponse.json({ error: 'Cannot manually add to smart groups' }, { status: 400 });

    const inserts = contactIds.map((contactId) => ({
      group_id: id,
      contact_id: contactId
    }));

    const { error } = await supabase
      .from('contact_group_members')
      .insert(inserts);

    // Ignoring conflict errors since the constraint is unique(group_id, contact_id)
    if (error && error.code !== '23505') {
       throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    const contactIds = parseContactIds(await request.json().catch(() => null));
    if (contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds array required' }, { status: 400 });
    }

    const { data: group } = await supabase.from('contact_groups').select('id, is_smart').eq('id', id).eq('account_id', accountId).maybeSingle();
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await supabase
      .from('contact_group_members')
      .delete()
      .eq('group_id', id)
      .in('contact_id', contactIds);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
