import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');

    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.subject || !body.body_html) {
      return NextResponse.json({ error: 'Name, subject, and body_html are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        account_id: accountId,
        name: body.name,
        subject: body.subject,
        body_html: body.body_html,
        body_text: body.body_text || null,
        category: body.category || 'general',
        variables: body.variables || [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
