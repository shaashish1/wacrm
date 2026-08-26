import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('meta_conversions_config')
      .select('id, pixel_id, is_active, test_event_code, events_config')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) throw error;
    
    // We do NOT return the encrypted access token to the client.
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');

    const body = await request.json().catch(() => null);
    if (!body || !body.pixel_id || !body.access_token) {
      return NextResponse.json({ error: 'Pixel ID and Access Token are required' }, { status: 400 });
    }

    const encryptedToken = encrypt(body.access_token);

    const { data, error } = await supabase
      .from('meta_conversions_config')
      .upsert({
        account_id: accountId,
        pixel_id: body.pixel_id,
        access_token_encrypted: encryptedToken,
        is_active: body.is_active ?? true,
        test_event_code: body.test_event_code || null,
        events_config: body.events_config || {}
      }, { onConflict: 'account_id' })
      .select('id, pixel_id, is_active, test_event_code, events_config')
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
