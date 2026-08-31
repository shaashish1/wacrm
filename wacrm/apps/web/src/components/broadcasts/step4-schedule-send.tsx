'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Send, Loader2, Users, Save, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BroadcastRecurrence } from '@/lib/broadcasts/recurrence';
import { countMarketingEligibility } from '@/lib/consent';
import {
  DEFAULT_JITTER_MAX_SEC,
  DEFAULT_JITTER_MIN_SEC,
  normalizeJitterSeconds,
} from '@/lib/broadcasts/jitter';
import { useAuth } from '@/hooks/use-auth';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  groupIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template?: MessageTemplate | null;
  /** When set, review step shows a plain-text preview instead of a template. */
  isPlainText?: boolean;
  plainTextPreview?: string;
  audience: AudienceConfig;
  onSend: (
    scheduledAt?: string | null,
    recurrence?: BroadcastRecurrence | null,
    jitter?: { minSec: number; maxSec: number } | null,
  ) => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
  showJitter?: boolean;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  isPlainText = false,
  plainTextPreview,
  audience,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
  showJitter = false,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const { accountId } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [ineligibleCount, setIneligibleCount] = useState<number | null>(null);
  const [loadingReach, setLoadingReach] = useState(true);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [recurrence, setRecurrence] = useState<BroadcastRecurrence | ''>('');
  const [jitterMin, setJitterMin] = useState(String(DEFAULT_JITTER_MIN_SEC));
  const [jitterMax, setJitterMax] = useState(String(DEFAULT_JITTER_MAX_SEC));

  useEffect(() => {
    if (!accountId || !showJitter) return;
    const supabase = createClient();
    void supabase
      .from('accounts')
      .select('broadcast_jitter_min_sec, broadcast_jitter_max_sec')
      .eq('id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const j = normalizeJitterSeconds(
          data.broadcast_jitter_min_sec,
          data.broadcast_jitter_max_sec,
        );
        setJitterMin(String(j.minSec));
        setJitterMax(String(j.maxSec));
      });
  }, [accountId, showJitter]);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        let ids: string[] = [];
        if (audience.type === 'all') {
          const { data } = await supabase.from('contacts').select('id');
          ids = (data ?? []).map((c) => c.id);
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);
          ids = [...new Set((contactTags ?? []).map((ct) => ct.contact_id))];
        } else if (audience.type === 'csv' && audience.csvContacts) {
          setEstimatedReach(audience.csvContacts.length);
          setEligibleCount(null);
          setIneligibleCount(null);
          return;
        } else if (audience.type === 'group' && audience.groupIds && audience.groupIds.length > 0) {
          const idSet = new Set<string>();
          for (const groupId of audience.groupIds) {
            const { data } = await supabase.rpc('resolve_group_members', {
              p_group_id: groupId,
            });
            for (const row of data ?? []) {
              if (row.contact_id) idSet.add(row.contact_id);
            }
          }
          ids = [...idSet];
        }
        setEstimatedReach(ids.length);
        if (accountId && ids.length > 0) {
          const preview = await countMarketingEligibility(supabase, accountId, ids, 'whatsapp');
          setEligibleCount(preview.eligible);
          setIneligibleCount(preview.ineligible);
        } else {
          setEligibleCount(0);
          setIneligibleCount(ids.length);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience, accountId]);

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : audience.type === 'group'
            ? t('scheduleSend.audienceGroup')
            : t('scheduleSend.audienceField');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.summary')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">
              {isPlainText ? t('scheduleSend.message') : t('scheduleSend.template')}
            </p>
            <p className="line-clamp-3 text-foreground">
              {isPlainText
                ? (plainTextPreview?.trim() || t('scheduleSend.plainText'))
                : (template?.name ?? t('scheduleSend.plainText'))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.audience')}</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.estimatedReach')}</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-medium text-foreground">{estimatedReach.toLocaleString()}</p>
                </>
              )}
            </div>
            {!loadingReach && eligibleCount !== null && ineligibleCount !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('scheduleSend.eligibleVsNot', {
                  eligible: eligibleCount.toLocaleString(),
                  ineligible: ineligibleCount.toLocaleString(),
                })}
              </p>
            )}
          </div>
          {!isPlainText && (
            <div>
              <p className="text-xs text-muted-foreground">{t('scheduleSend.language')}</p>
              <p className="text-foreground">{template?.language ?? 'en_US'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Send now vs schedule */}
      <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.when')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSendMode('now')}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              sendMode === 'now'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            <Send className="h-4 w-4" />
            {t('scheduleSend.sendNow')}
          </button>
          <button
            type="button"
            onClick={() => setSendMode('schedule')}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              sendMode === 'schedule'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            <Clock className="h-4 w-4" />
            {t('scheduleSend.schedule')}
          </button>
        </div>
        {sendMode === 'schedule' && (
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              {t('scheduleSend.scheduledAt')}
            </label>
            <Input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
            <div className="mt-3">
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t('scheduleSend.repeat')}
              </label>
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as BroadcastRecurrence | '')
                }
                className="h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground"
              >
                <option value="">{t('scheduleSend.repeatNone')}</option>
                <option value="daily">{t('scheduleSend.repeatDaily')}</option>
                <option value="weekly">{t('scheduleSend.repeatWeekly')}</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {showJitter && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">{t('scheduleSend.jitterTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('scheduleSend.jitterDisclaimer')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t('scheduleSend.jitterMin')}
              </label>
              <Input
                type="number"
                min={0}
                max={300}
                value={jitterMin}
                onChange={(e) => setJitterMin(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t('scheduleSend.jitterMax')}
              </label>
              <Input
                type="number"
                min={0}
                max={300}
                value={jitterMax}
                onChange={(e) => setJitterMax(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogTrigger
            render={
              <Button
                disabled={
                  !name.trim() ||
                  isProcessing ||
                  (sendMode === 'schedule' && !scheduledLocal)
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              />
            }
          >
            {sendMode === 'schedule' ? (
              <Clock className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sendMode === 'schedule'
              ? t('scheduleSend.scheduleSend')
              : t('scheduleSend.sendNow')}
          </DialogTrigger>
          <DialogContent className="border-border bg-popover sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {sendMode === 'schedule'
                  ? t('scheduleSend.confirmScheduleTitle')
                  : t('scheduleSend.confirmTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {sendMode === 'schedule'
                  ? t('scheduleSend.confirmBody', { count: estimatedReach.toLocaleString() })
                  : t('scheduleSend.confirmBodyNow', { count: estimatedReach.toLocaleString() })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-border text-muted-foreground"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  const iso =
                    sendMode === 'schedule' && scheduledLocal
                      ? new Date(scheduledLocal).toISOString()
                      : null;
                  onSend(
                    iso,
                    sendMode === 'schedule' && recurrence ? recurrence : null,
                    showJitter
                      ? normalizeJitterSeconds(Number(jitterMin), Number(jitterMax))
                      : null,
                  );
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {sendMode === 'schedule' ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sendMode === 'schedule'
                  ? t('scheduleSend.scheduleSend')
                  : t('scheduleSend.sendNow')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
