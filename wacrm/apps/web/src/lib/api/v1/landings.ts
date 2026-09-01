// ============================================================
// Public-API landing page serializers + input parsers.
//
// Landings capture prior express consent on /p/[slug]. These
// endpoints manage the page rows only — they never grant consent
// and never send WhatsApp.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_CONSENT_COPY,
  DEFAULT_LANDING_BODY,
  DEFAULT_LANDING_HEADLINE,
  isValidLandingSlug,
  normalizeLandingSlug,
} from '@/lib/landings';

export const LANDING_SELECT =
  'id, slug, title, headline, body, consent_copy, published, created_at, updated_at';

export interface ApiLanding {
  id: string;
  slug: string;
  title: string;
  headline: string | null;
  body: string | null;
  consent_copy: string;
  published: boolean;
  created_at: string;
  updated_at: string | null;
}

export function serializeLanding(row: Record<string, unknown>): ApiLanding {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    headline: (row.headline as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    consent_copy: (row.consent_copy as string) ?? DEFAULT_CONSENT_COPY,
    published: Boolean(row.published),
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export interface ParsedLandingCreate {
  slug: string;
  title: string;
  headline: string;
  body: string;
  consent_copy: string;
  published: boolean;
}

export interface ParsedLandingUpdate {
  slug?: string;
  title?: string;
  headline?: string;
  body?: string;
  consent_copy?: string;
  published?: boolean;
}

export function parseLandingCreate(
  body: unknown
):
  | { ok: true; value: ParsedLandingCreate }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const rec = body as Record<string, unknown>;
  const slug = normalizeLandingSlug(String(rec.slug ?? ''));
  if (!isValidLandingSlug(slug)) {
    return {
      ok: false,
      message:
        "Slug must be 1–64 characters: lowercase letters, numbers, and hyphens.",
    };
  }
  const title = typeof rec.title === 'string' ? rec.title.trim() : '';
  if (!title) return { ok: false, message: "'title' is required" };

  return {
    ok: true,
    value: {
      slug,
      title,
      headline:
        typeof rec.headline === 'string' && rec.headline.trim()
          ? rec.headline.trim()
          : DEFAULT_LANDING_HEADLINE,
      body:
        typeof rec.body === 'string' && rec.body.trim()
          ? rec.body.trim()
          : DEFAULT_LANDING_BODY,
      consent_copy:
        typeof rec.consent_copy === 'string' && rec.consent_copy.trim()
          ? rec.consent_copy.trim()
          : DEFAULT_CONSENT_COPY,
      published: rec.published === true,
    },
  };
}

export function parseLandingUpdate(
  body: unknown
):
  | { ok: true; value: ParsedLandingUpdate }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const rec = body as Record<string, unknown>;
  const value: ParsedLandingUpdate = {};

  if ('slug' in rec) {
    if (typeof rec.slug !== 'string') {
      return { ok: false, message: "'slug' must be a string" };
    }
    const slug = normalizeLandingSlug(rec.slug);
    if (!isValidLandingSlug(slug)) {
      return {
        ok: false,
        message:
          "Slug must be 1–64 characters: lowercase letters, numbers, and hyphens.",
      };
    }
    value.slug = slug;
  }
  if ('title' in rec) {
    if (typeof rec.title !== 'string' || !rec.title.trim()) {
      return { ok: false, message: "'title' must be a non-empty string" };
    }
    value.title = rec.title.trim();
  }
  if ('headline' in rec) {
    if (typeof rec.headline !== 'string') {
      return { ok: false, message: "'headline' must be a string" };
    }
    value.headline = rec.headline.trim();
  }
  if ('body' in rec) {
    if (typeof rec.body !== 'string') {
      return { ok: false, message: "'body' must be a string" };
    }
    value.body = rec.body.trim();
  }
  if ('consent_copy' in rec) {
    if (typeof rec.consent_copy !== 'string' || !rec.consent_copy.trim()) {
      return {
        ok: false,
        message: "'consent_copy' must be a non-empty string",
      };
    }
    value.consent_copy = rec.consent_copy.trim();
  }
  if ('published' in rec) {
    if (typeof rec.published !== 'boolean') {
      return { ok: false, message: "'published' must be a boolean" };
    }
    value.published = rec.published;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, message: 'No updatable fields provided' };
  }
  return { ok: true, value };
}

export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export async function createLanding(
  db: SupabaseClient,
  opts: { accountId: string; body: unknown }
): Promise<
  | { ok: true; landing: ApiLanding }
  | { ok: false; code: 'bad_request' | 'conflict' | 'internal'; message: string }
> {
  const parsed = parseLandingCreate(opts.body);
  if (!parsed.ok) return { ok: false, code: 'bad_request', message: parsed.message };

  const { data, error } = await db
    .from('landing_pages')
    .insert({
      account_id: opts.accountId,
      slug: parsed.value.slug,
      title: parsed.value.title,
      headline: parsed.value.headline,
      body: parsed.value.body,
      consent_copy: parsed.value.consent_copy,
      published: parsed.value.published,
    })
    .select(LANDING_SELECT)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 'conflict', message: 'That slug is already in use' };
    }
    console.error('[landings] create error:', error);
    return { ok: false, code: 'internal', message: 'Failed to create landing' };
  }

  return { ok: true, landing: serializeLanding(data as Record<string, unknown>) };
}

export async function updateLanding(
  db: SupabaseClient,
  opts: { accountId: string; landingId: string; body: unknown }
): Promise<
  | { ok: true; landing: ApiLanding }
  | {
      ok: false;
      code: 'bad_request' | 'not_found' | 'conflict' | 'internal';
      message: string;
    }
> {
  const parsed = parseLandingUpdate(opts.body);
  if (!parsed.ok) return { ok: false, code: 'bad_request', message: parsed.message };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...parsed.value,
  };

  const { data, error } = await db
    .from('landing_pages')
    .update(patch)
    .eq('id', opts.landingId)
    .eq('account_id', opts.accountId)
    .select(LANDING_SELECT)
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 'conflict', message: 'That slug is already in use' };
    }
    console.error('[landings] update error:', error);
    return { ok: false, code: 'internal', message: 'Failed to update landing' };
  }
  if (!data) {
    return { ok: false, code: 'not_found', message: 'Landing not found' };
  }

  return { ok: true, landing: serializeLanding(data as Record<string, unknown>) };
}
