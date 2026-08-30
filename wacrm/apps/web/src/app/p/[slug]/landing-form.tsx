'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LANDING_PHI_BANNER, type PublicLanding } from '@/lib/landings';

export function LandingForm({ landing }: { landing: PublicLanding }) {
  const search = useSearchParams();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError('Please check the consent box to continue.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/public/landings/${encodeURIComponent(landing.slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email.trim() || undefined,
          consent: true,
          utm_source: search.get('utm_source'),
          utm_medium: search.get('utm_medium'),
          utm_campaign: search.get('utm_campaign'),
          utm_content: search.get('utm_content'),
          utm_term: search.get('utm_term'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not submit. Try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not submit. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">You are on the list</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We will follow up about a wellness consult or tour. Reply STOP on WhatsApp
          anytime to opt out. This channel is not for clinical results.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
        {LANDING_PHI_BANNER}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="landing-name">Name</Label>
        <Input
          id="landing-name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landing-phone">Mobile (WhatsApp)</Label>
        <Input
          id="landing-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          placeholder="+1 305 555 0100"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landing-email">Email (optional)</Label>
        <Input
          id="landing-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2.5 text-sm leading-snug">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>{landing.consent_copy}</span>
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={busy || !consent} className="w-full">
        {busy ? 'Sending…' : 'Request a consult'}
      </Button>
    </form>
  );
}
