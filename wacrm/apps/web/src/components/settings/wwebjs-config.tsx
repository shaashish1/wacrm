'use client';

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCcw,
  Info,
  Smartphone,
  QrCode,
  Shield,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type PairingMode = 'qr' | 'phone';

export function WWebJSConfig() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pairingMode, setPairingMode] = useState<PairingMode>('qr');
  const [phoneInput, setPhoneInput] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [updatingPreset, setUpdatingPreset] = useState(false);

  const handlePresetChange = async (preset: string) => {
    if (!accountId) return;
    setUpdatingPreset(true);
    const newConfig = { ...(session?.config || {}), antibanPreset: preset };
    const { error } = await supabase
      .from('sessions')
      .update({ config: newConfig })
      .eq('account_id', accountId);
    if (error) {
      toast.error('Failed to update anti-ban strategy');
    } else {
      toast.success('Anti-ban strategy updated. Will apply on next restart.');
      setSession((prev: any) => ({ ...prev, config: newConfig }));
    }
    setUpdatingPreset(false);
  };
  const [qrUpdatedAt, setQrUpdatedAt] = useState<number>(0);
  const [qrCountdown, setQrCountdown] = useState(20);
  const [starting, setStarting] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!accountId) return;
    try {
      const [{ data, error }, apiPayload] = await Promise.all([
        supabase.from('sessions').select('*').eq('account_id', accountId).maybeSingle(),
        fetch('/api/whatsapp/config')
          .then((r) => r.json())
          .catch(() => null),
      ]);

      const merged = {
        ...(data || {}),
        qr_code: data?.qr_code || apiPayload?.qr_code || null,
        pairing_code: data?.pairing_code || apiPayload?.pairing_code || null,
        status: data?.status || apiPayload?.session_status || null,
        phone_number: data?.phone_number || apiPayload?.phone_number || null,
      };
      const hasRow = !!(data || apiPayload?.qr_code || apiPayload?.session_status);

      if (error) {
        console.error('Failed to load session:', error);
      } else {
        if (merged.qr_code || merged.pairing_code || merged.status === 'READY') {
          console.log('[wwebjs] session poll', {
            status: merged.status,
            hasQr: !!merged.qr_code,
            hasPairing: !!merged.pairing_code,
          });
        }
        if (merged.qr_code || merged.pairing_code) {
          setStarting(false);
        }
        setSession((prev: any) => {
          if (JSON.stringify(prev) !== JSON.stringify(merged)) {
            if (merged.qr_code && merged.qr_code !== prev?.qr_code) {
              setQrUpdatedAt(Date.now());
            }
            return hasRow ? merged : data;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    fetchSession();
  }, [accountId, fetchSession]);

  useEffect(() => {
    if (!accountId) return;
    if (session?.status === 'READY') return;
    const interval = setInterval(() => {
      fetchSession();
    }, 1000);
    return () => clearInterval(interval);
  }, [accountId, fetchSession, starting, session?.status]);

  // QR countdown timer
  useEffect(() => {
    if (!qrUpdatedAt || !session?.qr_code) return;
    setQrCountdown(20);
    const interval = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrUpdatedAt, session?.qr_code]);

  const handleRestart = async () => {
    toast.success('Resetting session...');
    setStarting(false);
    await supabase
      .from('sessions')
      .delete()
      .eq('account_id', accountId);
    setSession(null);
  };

  const handleConnectQR = async () => {
    setRequesting(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_type: 'wwebjs', start_session: true }),
      });
      if (!res.ok) throw new Error('Failed to start session');
      setStarting(true);
      toast.success('Starting QR code session...');
    } catch {
      toast.error('Failed to start session');
    } finally {
      setRequesting(false);
    }
  };

  const handleConnectPhone = async () => {
    const cleaned = phoneInput.replace(/[^0-9]/g, '');
    if (cleaned.length < 10) {
      toast.error(
        'Enter your full phone number with country code (e.g. 919876543210)'
      );
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_type: 'wwebjs',
          pairing_phone: cleaned,
        }),
      });
      if (!res.ok) throw new Error('Failed to request pairing code');
      toast.success('Requesting pairing code...');
    } catch {
      toast.error('Failed to request pairing code');
    } finally {
      setRequesting(false);
    }
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
  const pairingCode = session?.pairing_code;
  const hasActiveSession =
    starting ||
    (session &&
      (isConnected ||
        qrCode ||
        pairingCode ||
        session.status === 'qr_pending'));

  // Warming Mode
  const WARMING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
  const isWarming =
    session?.warming_started_at && !session?.warming_graduated_at;
  const startedAt = session?.warming_started_at
    ? new Date(session.warming_started_at).getTime()
    : 0;
  const timeInWarming = Date.now() - startedAt;
  const daysInWarming = Math.max(
    1,
    Math.ceil(timeInWarming / (1000 * 60 * 60 * 24))
  );
  const isStillIn7Days = timeInWarming < WARMING_PERIOD_MS;
  const currentlyWarming =
    isWarming || (startedAt > 0 && isStillIn7Days);

  const dailyCount = session?.daily_new_contact_count || 0;
  const dailyLimit = 250;
  const dailyPercentage = Math.min(
    100,
    Math.round((dailyCount / dailyLimit) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Warming Mode Progress */}
      {isConnected && session && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="size-4 text-blue-500" />
              Account Status:{' '}
              {currentlyWarming ? 'Warming Mode' : 'Fully Active'}
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
                <span>
                  {dailyCount} / {dailyLimit}
                </span>
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
      <Alert
        variant="destructive"
        className="bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400"
      >
        <AlertTriangle className="size-4" />
        <AlertTitle>Warning: Unofficial API Risk</AlertTitle>
        <AlertDescription>
          Using WhatsApp Web JS relies on unofficial APIs. Meta
          actively monitors for automated behavior.{' '}
          <strong>Your number can be permanently banned</strong> if
          you send spam or rapid bulk broadcasts.
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
            {isConnected
              ? 'WhatsApp Web Connected'
              : 'WhatsApp Web Disconnected'}
          </AlertTitle>
        </div>
        <AlertDescription className="text-muted-foreground mt-1">
          {isConnected
            ? `Linked as ${session?.session_data?.pushname || session?.phone_number || 'Connected'}. Events will flow through WhatsApp Web.`
            : 'Connect your device using QR code or phone number pairing.'}
        </AlertDescription>
      </Alert>

      {/* Anti-Ban Strategy */}
      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Shield className="size-4 text-green-500" />
              Anti-Ban Strategy
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Select the rate limiting profile to avoid Meta bans. Requires a session restart to take effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Select
                disabled={updatingPreset}
                value={session?.config?.antibanPreset || 'moderate'}
                onValueChange={handlePresetChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative (Safest, Slow)</SelectItem>
                  <SelectItem value="moderate">Moderate (Balanced)</SelectItem>
                  <SelectItem value="aggressive">Aggressive (Faster, Higher Risk)</SelectItem>
                  <SelectItem value="high-volume">High Volume (Max Speed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Device Pairing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">
            Device Pairing
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isConnected
              ? 'Your paired device information.'
              : 'Choose a method to link your WhatsApp account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-2">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Device:</span>{' '}
                {session?.session_data?.pushname || 'Connected'}
              </p>
              {session?.phone_number && (
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Phone:</span>{' '}
                  +{session.phone_number}
                </p>
              )}
            </div>
          ) : !hasActiveSession ? (
            <>
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                <button
                  onClick={() => setPairingMode('qr')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    pairingMode === 'qr'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <QrCode className="size-4" />
                  QR Code
                </button>
                <button
                  onClick={() => setPairingMode('phone')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    pairingMode === 'phone'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Smartphone className="size-4" />
                  Phone Number
                </button>
              </div>

              {pairingMode === 'qr' ? (
                <div className="flex flex-col items-center justify-center p-8 bg-muted/50 rounded-lg border border-border border-dashed">
                  <QrCode className="size-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4 text-center">
                    Click below to generate a QR code, then scan it
                    with WhatsApp &gt; Linked Devices.
                  </p>
                  <Button
                    onClick={handleConnectQR}
                    disabled={requesting}
                  >
                    {requesting && (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    )}
                    Generate QR Code
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 p-6 bg-muted/50 rounded-lg border border-border border-dashed">
                  <p className="text-sm text-muted-foreground">
                    Enter your WhatsApp phone number with country
                    code. You&apos;ll receive an 8-digit code to
                    enter on your phone.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 919876543210"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      onClick={handleConnectPhone}
                      disabled={requesting || !phoneInput.trim()}
                    >
                      {requesting && (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      )}
                      Get Pairing Code
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    On your phone: WhatsApp &gt; Settings &gt;
                    Linked Devices &gt; Link a Device &gt;{' '}
                    <strong>Link with phone number instead</strong>
                  </p>
                </div>
              )}
            </>
          ) : qrCode ? (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-border">
              <QRCodeSVG value={qrCode} size={280} level="M" />
              <div className="mt-4 flex items-center gap-2 text-sm">
                {qrCountdown > 0 ? (
                  <span className="text-muted-foreground">
                    Refreshes in{' '}
                    <span className="font-mono font-medium text-foreground">
                      {qrCountdown}s
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Refreshing...
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Open WhatsApp &gt; Linked Devices &gt; Scan this
                code
              </p>
            </div>
          ) : pairingCode ? (
            <div className="flex flex-col items-center justify-center p-8 bg-muted/50 rounded-lg border border-border">
              <Smartphone className="size-8 text-primary mb-4" />
              <p className="text-sm text-muted-foreground mb-3">
                Enter this code on your phone:
              </p>
              <div className="text-4xl font-mono font-bold tracking-[0.3em] text-foreground bg-background px-6 py-3 rounded-lg border border-border">
                {pairingCode}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
                WhatsApp &gt; Settings &gt; Linked Devices &gt; Link
                a Device &gt;{' '}
                <strong>Link with phone number instead</strong>
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-muted/50 rounded-lg border border-border border-dashed">
              <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Connecting to WhatsApp servers...
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
