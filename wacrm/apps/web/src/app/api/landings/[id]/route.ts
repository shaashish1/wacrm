import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isValidLandingSlug, normalizeLandingSlug } from '@/lib/landings';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (typeof body.headline === 'string') patch.headline = body.headline.trim();
    if (typeof body.body === 'string') patch.body = body.body.trim();
    if (typeof body.consent_copy === 'string' && body.consent_copy.trim()) {
      patch.consent_copy = body.consent_copy.trim();
    }
    if (typeof body.published === 'boolean') patch.published = body.published;
    if (typeof body.slug === 'string') {
      const slug = normalizeLandingSlug(body.slug);
      if (!isValidLandingSlug(slug)) {
        return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
      }
      patch.slug = slug;
    }

    const { data, error } = await supabase
      .from('landing_pages')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That slug is already in use.' },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await params;
    const { error } = await supabase
      .from('landing_pages')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
