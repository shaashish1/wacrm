export const LANDING_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const DEFAULT_CONSENT_COPY =
  'I agree to receive wellness and marketing messages from this clinic on WhatsApp and email. This is not a clinical or medical-records channel. Do not share diagnoses, medications, lab results, or insurance details here. Reply STOP to opt out. Message and data rates may apply.';

export const DEFAULT_LANDING_HEADLINE = 'Request a wellness consult';

export const DEFAULT_LANDING_BODY =
  'Tell us how to reach you for a wellness consult, nutrition intro, or membership tour. This page is for marketing and scheduling only.';

export const LANDING_PHI_BANNER =
  'WhatsApp and this form are for scheduling and marketing only. Please do not share diagnoses, medications, lab results, Social Security numbers, or insurance IDs.';

export function normalizeLandingSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLandingSlug(slug: string): boolean {
  return LANDING_SLUG_RE.test(slug);
}

export interface PublicLanding {
  slug: string;
  title: string;
  headline: string | null;
  body: string | null;
  consent_copy: string;
}

export interface LandingPageRow {
  id: string;
  account_id: string;
  slug: string;
  title: string;
  headline: string | null;
  body: string | null;
  consent_copy: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}
