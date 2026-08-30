import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { normalizeLandingSlug } from '@/lib/landings';
import { LandingForm } from './landing-form';

type Props = { params: Promise<{ slug: string }> };

async function loadPublished(slug: string) {
  const { data } = await supabaseAdmin()
    .from('landing_pages')
    .select('slug, title, headline, body, consent_copy, published')
    .eq('slug', normalizeLandingSlug(slug))
    .eq('published', true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = await loadPublished(slug);
  if (!landing) return { title: 'Page not found' };
  return {
    title: landing.title,
    description: landing.headline || landing.body || landing.title,
    robots: { index: false, follow: false },
  };
}

export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params;
  const landing = await loadPublished(slug);
  if (!landing) notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Wellness &amp; marketing
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {landing.headline || landing.title}
          </h1>
          {landing.body ? (
            <p className="mt-2 text-sm text-muted-foreground">{landing.body}</p>
          ) : null}
        </div>
        <Suspense fallback={null}>
          <LandingForm
            landing={{
              slug: landing.slug,
              title: landing.title,
              headline: landing.headline,
              body: landing.body,
              consent_copy: landing.consent_copy,
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
