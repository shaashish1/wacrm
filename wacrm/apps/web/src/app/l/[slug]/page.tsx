import { redirect } from 'next/navigation';

import { normalizeLandingSlug } from '@/lib/landings';

export default async function LandingAliasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/p/${encodeURIComponent(normalizeLandingSlug(slug))}`);
}
