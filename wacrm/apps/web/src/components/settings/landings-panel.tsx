'use client';

import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { useCan } from '@/hooks/use-can';
import type { LandingPageRow } from '@/lib/landings';
import { isValidLandingSlug, normalizeLandingSlug } from '@/lib/landings';

function publicUrl(slug: string): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? '');
  return `${origin.replace(/\/$/, '')}/p/${slug}`;
}

export function LandingsPanel() {
  const canEdit = useCan('send-messages');
  const [rows, setRows] = useState<LandingPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('Wellness week');
  const [saving, setSaving] = useState(false);

  async function reload() {
    const res = await fetch('/api/landings', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load landings');
    setRows(json.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load landings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createLanding(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeLandingSlug(slug);
    if (!isValidLandingSlug(normalized)) {
      toast.error('Use a lowercase slug like wellness-week');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/landings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: normalized, title: title.trim(), published: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      setRows((prev) => [json.data, ...prev]);
      setSlug('');
      toast.success('Landing created. Share the public URL.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(id: string, published: boolean) {
    const res = await fetch(`/api/landings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Update failed');
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? json.data : r)));
  }

  function copyUrl(row: LandingPageRow) {
    const url = publicUrl(row.slug);
    void navigator.clipboard.writeText(url).then(
      () => toast.success('Copied public URL'),
      () => toast.error('Copy failed — select the URL manually'),
    );
  }

  return (
    <section>
      <SettingsPanelHead
        title="Landing pages"
        description="Public wellness capture at /p/[slug]. Name, phone, email, UTM, and an unchecked marketing-consent box. No clinical fields."
      />

      {canEdit ? (
        <form
          onSubmit={createLanding}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="landing-slug">Slug</Label>
            <Input
              id="landing-slug"
              placeholder="wellness-week"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="landing-title">Title</Label>
            <Input
              id="landing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </form>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No landings yet. Create a slug, publish it, then open /p/your-slug locally to test
          the form. Broadcasts will not send until a contact has a consent row.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{row.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {publicUrl(row.slug)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.published}
                  disabled={!canEdit}
                  onCheckedChange={(next) => setPublished(row.id, Boolean(next))}
                />
                <span className="text-xs text-muted-foreground">
                  {row.published ? 'Published' : 'Draft'}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => copyUrl(row)}>
                  <Copy className="size-4" />
                </Button>
                {row.published ? (
                  <a
                    href={publicUrl(row.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
