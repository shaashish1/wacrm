'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';

/**
 * Send pacing — random delay and unofficial rate presets.
 * This is pacing. It is not a ToS or ban warranty.
 */
export function SendPacingPanel() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [jitterMin, setJitterMin] = useState('1');
  const [jitterMax, setJitterMax] = useState('3');
  const [savingJitter, setSavingJitter] = useState(false);
  const [preset, setPreset] = useState<string>('moderate');
  const [hasSession, setHasSession] = useState(false);
  const [updatingPreset, setUpdatingPreset] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const [account, session] = await Promise.all([
        supabase
          .from('accounts')
          .select('broadcast_jitter_min_sec, broadcast_jitter_max_sec')
          .eq('id', accountId)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('config')
          .eq('account_id', accountId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (account.data?.broadcast_jitter_min_sec != null) {
        setJitterMin(String(account.data.broadcast_jitter_min_sec));
      }
      if (account.data?.broadcast_jitter_max_sec != null) {
        setJitterMax(String(account.data.broadcast_jitter_max_sec));
      }
      if (session.data) {
        setHasSession(true);
        const stored = (session.data.config as { antibanPreset?: string } | null)
          ?.antibanPreset;
        if (stored) setPreset(stored);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  const saveJitter = useCallback(async () => {
    if (!accountId) return;
    const min = Math.max(0, Math.min(300, Number(jitterMin) || 1));
    const max = Math.max(min, Math.min(300, Number(jitterMax) || 3));
    setSavingJitter(true);
    const { error } = await supabase
      .from('accounts')
      .update({
        broadcast_jitter_min_sec: min,
        broadcast_jitter_max_sec: max,
      })
      .eq('id', accountId);
    setSavingJitter(false);
    if (error) {
      toast.error('Failed to save send delay');
      return;
    }
    setJitterMin(String(min));
    setJitterMax(String(max));
    toast.success('Send delay saved');
  }, [accountId, jitterMax, jitterMin, supabase]);

  const savePreset = useCallback(
    async (next: string) => {
      if (!accountId) return;
      setUpdatingPreset(true);
      const { data: row } = await supabase
        .from('sessions')
        .select('config')
        .eq('account_id', accountId)
        .maybeSingle();
      const newConfig = { ...(row?.config || {}), antibanPreset: next };
      const { error } = await supabase
        .from('sessions')
        .update({ config: newConfig })
        .eq('account_id', accountId);
      setUpdatingPreset(false);
      if (error) {
        toast.error('Failed to save send pacing');
        return;
      }
      setPreset(next);
      toast.success('Send pacing saved. Restart the unofficial session to apply.');
    },
    [accountId, supabase],
  );

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Send pacing"
        description="Random delay between sends. This is pacing. It is not a ToS or ban warranty. Daily cap, consent, and STOP still apply."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Broadcast delay</CardTitle>
          <CardDescription>
            Default random delay in seconds. Per-broadcast values in the
            wizard override this.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Min
            </label>
            <Input
              type="number"
              min={0}
              max={300}
              value={jitterMin}
              onChange={(e) => setJitterMin(e.target.value)}
              className="w-24"
              disabled={!loaded}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Max
            </label>
            <Input
              type="number"
              min={0}
              max={300}
              value={jitterMax}
              onChange={(e) => setJitterMax(e.target.value)}
              className="w-24"
              disabled={!loaded}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={savingJitter || !loaded}
            onClick={() => void saveJitter()}
          >
            {savingJitter ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              'Save delay'
            )}
          </Button>
        </CardContent>
      </Card>

      {hasSession ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Unofficial WhatsApp rate
            </CardTitle>
            <CardDescription>
              QR pairing is unofficial WhatsApp. Ban risk is real. This
              preset only changes how fast unofficial sends are paced.
              Restart the session after you change it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Select
                disabled={updatingPreset}
                value={preset}
                onValueChange={(v) => {
                  if (v) void savePreset(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select pacing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">
                    Conservative — slower
                  </SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="aggressive">
                    Faster — higher ban risk
                  </SelectItem>
                  <SelectItem value="high-volume">
                    Fastest — highest ban risk
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
