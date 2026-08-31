'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function messageLabel(broadcast: Broadcast, plainText: string): string {
  if (broadcast.template_name === 'plain_text') return plainText;
  return broadcast.template_name || plainText;
}

function lastActivityIso(broadcast: Broadcast): string {
  if (broadcast.status === 'scheduled' && broadcast.scheduled_at) {
    return broadcast.scheduled_at;
  }
  return broadcast.updated_at || broadcast.created_at;
}

function NewBroadcastLink({
  canCreate,
  className,
  label,
}: {
  canCreate: boolean;
  className?: string;
  label: string;
}) {
  if (!canCreate) {
    return (
      <GatedButton
        canAct={false}
        gateReason="create broadcasts"
        className={className}
      >
        <Plus className="h-4 w-4" />
        {label}
      </GatedButton>
    );
  }
  return (
    <Link
      href="/broadcasts/new"
      className={cn(buttonVariants(), className)}
    >
      <Plus className="h-4 w-4" />
      {label}
    </Link>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cronHint, setCronHint] = useState<string | null>(null);
  const broadcastsRef = useRef<Broadcast[]>([]);
  broadcastsRef.current = broadcasts;

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
      setError(null);
      const hasScheduled = (data ?? []).some((b) => b.status === 'scheduled');
      if (hasScheduled) {
        try {
          const health = await fetch('/api/health');
          const json = (await health.json()) as {
            last_cron_at?: string | null;
            cron_stale?: boolean;
          };
          if (json.cron_stale) {
            setCronHint(t('cronWaiting'));
          } else if (json.last_cron_at) {
            setCronHint(
              t('cronHeartbeat', {
                when: formatDistanceToNow(new Date(json.last_cron_at), {
                  addSuffix: true,
                }),
              }),
            );
          } else {
            setCronHint(t('cronUnknown'));
          }
        } catch {
          setCronHint(t('cronUnknown'));
        }
      } else {
        setCronHint(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errorLoad');
      if (broadcastsRef.current.length === 0) {
        setError(message);
        toast.error(t('errorLoad'));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  return (
    <div className="space-y-6">
      {anySending && (
        <div
          role="progressbar"
          aria-label={tStatus('sending')}
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          {cronHint && (
            <p className="mt-2 text-xs text-muted-foreground">{cronHint}</p>
          )}
        </div>
        <NewBroadcastLink
          canCreate={canCreate}
          label={t('newBroadcast')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">{t('errorLoad')}</p>
          <p className="max-w-md text-xs text-muted-foreground">{t('errorHint')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={() => {
              setLoading(true);
              fetchBroadcasts();
            }}>
              {t('retry')}
            </Button>
            <NewBroadcastLink canCreate={canCreate} label={t('newBroadcast')} />
          </div>
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Radio className="h-7 w-7 text-primary" />
          </div>
          <p className="text-base font-semibold text-foreground">{t('emptyTitle')}</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('emptyDesc')}</p>
          <div className="mt-6">
            <NewBroadcastLink
              canCreate={canCreate}
              label={t('emptyCta')}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            />
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t('table.name')}</TableHead>
                <TableHead className="hidden text-muted-foreground md:table-cell">{t('table.message')}</TableHead>
                <TableHead className="hidden text-right text-muted-foreground sm:table-cell">
                  {t('table.recipients')}
                </TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">{t('table.delivery')}</TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">{t('table.read')}</TableHead>
                <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                <TableHead className="hidden text-muted-foreground sm:table-cell">{t('table.lastActivity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                const total = broadcast.total_recipients ?? 0;
                const sent = broadcast.sent_count ?? 0;
                let activityLabel = '';
                try {
                  activityLabel = formatDistanceToNow(new Date(lastActivityIso(broadcast)), {
                    addSuffix: true,
                  });
                } catch {
                  activityLabel = new Date(broadcast.created_at).toLocaleDateString();
                }
                return (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer border-border hover:bg-muted/50"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{broadcast.name}</span>
                        {broadcast.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-border text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/broadcasts/new?draft=${broadcast.id}`);
                            }}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            {t('continue')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {messageLabel(broadcast, t('plainText'))}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {t('table.sentOf', { sent, total })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.delivered_count ?? 0}
                        total={total}
                        color="bg-primary"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.read_count ?? 0}
                        total={total}
                        color="bg-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                          </span>
                        )}
                        {tStatus(status.label)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {activityLabel}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
