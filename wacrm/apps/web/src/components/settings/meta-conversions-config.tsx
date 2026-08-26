'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { useCan } from '@/hooks/use-can';

export function MetaConversionsConfig() {
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [testEventCode, setTestEventCode] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/meta-conversions');
        const { data } = await res.json();
        
        if (data) {
          setIsActive(data.is_active);
          setPixelId(data.pixel_id || '');
          setTestEventCode(data.test_event_code || '');
        }
      } catch (err) {
        // fail silently if no config
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  async function handleSave() {
    if (!pixelId) return toast.error('Pixel ID is required');
    if (!accessToken) return toast.error('Access Token is required to update');

    setSaving(true);
    try {
      const res = await fetch('/api/meta-conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: isActive,
          pixel_id: pixelId,
          access_token: accessToken,
          test_event_code: testEventCode
        }),
      });

      if (!res.ok) throw new Error('Failed to save config');
      toast.success('Meta Conversions configuration saved');
      setAccessToken(''); // clear from memory
    } catch (e) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5 text-blue-500" />
          Meta Conversions API (CAPI)
        </CardTitle>
        <CardDescription>
          Send offline events (like Won Deals or Started Campaigns) directly to your Meta Pixel server-to-server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/40">
          <div className="space-y-0.5">
            <Label className="text-base">Enable Conversions API</Label>
            <p className="text-sm text-muted-foreground">
              Globally toggle server-side tracking.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={!canEdit}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Pixel ID</Label>
            <Input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="e.g., 123456789012345"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Test Event Code</Label>
            <Input
              value={testEventCode}
              onChange={(e) => setTestEventCode(e.target.value)}
              placeholder="TEST12345 (Optional)"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Access Token</Label>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Required for updates. Never displayed after saving."
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">
            Generate a system user access token in Meta Business Manager with `ads_management` and `ads_read` permissions.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end border-t pt-6">
        <GatedButton
          canAct={canEdit}
          gateReason="configure integrations"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
          Save Configuration
        </GatedButton>
      </CardFooter>
    </Card>
  );
}
