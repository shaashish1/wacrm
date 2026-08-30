import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { submitLandingLead } from '@/lib/landings-submit';
import { normalizeLandingSlug } from '@/lib/landings';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

type Params = { params: Promise<{ slug: string }> };

function pickUtm(search: URLSearchParams, body: Record<string, unknown>) {
  const from = (key: string) => {
    const b = body[key];
    if (typeof b === 'string' && b.trim()) return b.trim().slice(0, 200);
    const q = search.get(key);
    return q?.trim().slice(0, 200) || null;
  };
  return {
    utm_source: from('utm_source'),
    utm_medium: from('utm_medium'),
    utm_campaign: from('utm_campaign'),
    utm_content: from('utm_content'),
    utm_term: from('utm_term'),
  };
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip');
}

export async function GET(_request: Request, { params }: Params) {
  const { slug: raw } = await params;
  const slug = normalizeLandingSlug(raw);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('landing_pages')
    .select('slug, title, headline, body, consent_copy, published')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    data: {
      slug: data.slug,
      title: data.title,
      headline: data.headline,
      body: data.body,
      consent_copy: data.consent_copy,
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const ip = clientIp(request) ?? 'unknown';
  const limit = checkRateLimit(`landing:${ip}`, RATE_LIMITS.landingSubmit);
  if (!limit.success) return rateLimitResponse(limit);

  const { slug: raw } = await params;
  const slug = normalizeLandingSlug(raw);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: landing, error } = await db
    .from('landing_pages')
    .select('id, account_id, slug, consent_copy, published')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error || !landing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  try {
    await submitLandingLead(db, landing, {
      name: String(body.name ?? ''),
      phone: String(body.phone ?? ''),
      email: typeof body.email === 'string' ? body.email : null,
      consent: body.consent === true,
      utm: pickUtm(url.searchParams, body),
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submit failed';
    const status = /required|valid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
