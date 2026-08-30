import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  DEFAULT_CONSENT_COPY,
  DEFAULT_LANDING_BODY,
  DEFAULT_LANDING_HEADLINE,
  isValidLandingSlug,
  normalizeLandingSlug,
} from '@/lib/landings';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { data, error } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const body = await request.json().catch(() => null);
    const slug = normalizeLandingSlug(String(body?.slug ?? ''));
    const title = String(body?.title ?? '').trim();
    if (!isValidLandingSlug(slug)) {
      return NextResponse.json(
        {
          error:
            'Slug must be 1–64 characters: lowercase letters, numbers, and hyphens.',
        },
        { status: 400 },
      );
    }
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('landing_pages')
      .insert({
        account_id: accountId,
        slug,
        title,
        headline: String(body?.headline ?? DEFAULT_LANDING_HEADLINE).trim() || DEFAULT_LANDING_HEADLINE,
        body: String(body?.body ?? DEFAULT_LANDING_BODY).trim() || DEFAULT_LANDING_BODY,
        consent_copy:
          String(body?.consent_copy ?? DEFAULT_CONSENT_COPY).trim() ||
          DEFAULT_CONSENT_COPY,
        published: Boolean(body?.published),
      })
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
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
