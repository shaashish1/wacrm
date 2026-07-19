'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCcw, Info } from 'lucide-react';
import { toast } from 'sonner';

export function WWebJSConfig() {
  const t = useTranslations('Settings.whatsapp'); // We can reuse the translations where possible
  const supabase = createClient();
  const { accountId } = useAuth();
  
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = async () => {
    if (!accountId) return;
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load wwebjs session:', error);
      } else {
        setSession(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    if (!accountId) return;

    // Realtime subscription to the session row
    const channel = supabase
      .channel(`session_updates_${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSession(null);
          } else {
            setSession(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, supabase]);

  const handleRestart = async () => {
    // A quick API call to clear the session and restart it, or simply restart the worker.
    // For now, we can just delete the session row to trigger a restart on the worker if it watches it, 
    // or we can just send an API request to a new route `/api/whatsapp/wwebjs/restart`.
    toast.success('Restarting WWebJS session...');
    // TODO: implement restart endpoint if needed, for now deleting the session will let the worker recreate it if it polls, 
    // but the worker index.ts currently starts on boot. Let's just delete the session and let the worker recreate it on restart.
    await supabase.from('sessions').delete().eq('account_id', accountId);
    setSession(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = session?.status === 'READY';
  const qrCode = session?.qr_code;

  // Warming Mode Calculation
  const WARMING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
  const isWarming = session?.warming_started_at && !session?.warming_graduated_at;
  const startedAt = session?.warming_started_at ? new Date(session.warming_started_at).getTime() : 0;
  const timeInWarming = Date.now() - startedAt;
  const daysInWarming = Math.max(1, Math.ceil(timeInWarming / (1000 * 60 * 60 * 24)));
  const isStillIn7Days = timeInWarming < WARMING_PERIOD_MS;
  const currentlyWarming = isWarming || (startedAt > 0 && isStillIn7Days);
  
  const dailyCount = session?.daily_new_contact_count || 0;
  const dailyLimit = 250;
  const dailyPercentage = Math.min(100, Math.round((dailyCount / dailyLimit) * 100));

  return (
    <div className="space-y-6">
      {/* Warming Mode Progress */}
      {session && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="size-4 text-blue-500" />
              Account Status: {currentlyWarming ? 'Warming Mode' : 'Fully Active'}
            </CardTitle>
            <CardDescription>
              {currentlyWarming 
                ? `Day ${daysInWarming} of 7. Rate limits and random jitter are applied to prevent bans.` 
                : 'Your account has passed the warming phase. No jitter limits are applied.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Daily Messages Sent</span>
                <span>{dailyCount} / {dailyLimit}</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full ${dailyPercentage > 90 ? 'bg-red-500' : 'bg-blue-500'} transition-all`} 
                  style={{ width: `${dailyPercentage}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Disclaimer */}
      <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400">
        <AlertTriangle className="size-4" />
        <AlertTitle>Warning: Unofficial API Risk</AlertTitle>
        <AlertDescription>
          Using WhatsApp Web JS (WWebJS) relies on unofficial APIs. Meta actively monitors for automated behavior on personal or standard business accounts. <strong>Your number can be permanently banned</strong> if you send spam, unsolicited messages, or rapid bulk broadcasts. Use this provider strictly for testing, or warm up your number extremely carefully.
        </AlertDescription>
      </Alert>

      {/* Connection Status */}
      <Alert className="bg-card border-border">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <CheckCircle2 className="size-4 text-primary" />
          ) : (
            <XCircle className="size-4 text-red-500" />
          )}
          <AlertTitle className="text-foreground mb-0">
            {isConnected ? 'WhatsApp Web Connected' : 'WhatsApp Web Disconnected'}
          </AlertTitle>
        </div>
        <AlertDescription className="text-muted-foreground mt-1">
          {isConnected
            ? 'Your device is linked. Events will flow through WhatsApp Web.'
            : 'Scan the QR code below to connect your device.'}
        </AlertDescription>
      </Alert>

      {/* QR Code / Device Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Device Pairing</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isConnected ? 'Your paired device information.' : 'Open WhatsApp on your phone, go to Linked Devices, and scan this code.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected && qrCode ? (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-border">
              <QRCodeSVG value={qrCode} size={256} />
              <p className="text-xs text-muted-foreground mt-4 text-center">
                QR code updates automatically.
              </p>
            </div>
          ) : !isConnected ? (
            <div className="flex flex-col items-center justify-center p-12 bg-muted/50 rounded-lg border border-border border-dashed">
              <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">Waiting for QR Code from worker...</p>
            </div>
          ) : (
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Linked Device:</span> {session?.session_data?.pushname || 'Connected'}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4">
             <Button
                variant="outline"
                onClick={handleRestart}
                className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <RefreshCcw className="size-4 mr-2" />
                Reset Session
              </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
