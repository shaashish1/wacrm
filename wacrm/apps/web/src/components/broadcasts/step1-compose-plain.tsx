'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type PlainMediaKind = 'image' | 'video' | 'document';

export interface PlainTextDraft {
  body: string;
  mediaUrl: string;
  mediaKind: PlainMediaKind;
}

interface Step1ComposePlainProps {
  draft: PlainTextDraft;
  onChange: (draft: PlainTextDraft) => void;
  onNext: () => void;
  onBack: () => void;
}

const SAMPLE = { name: 'John Doe', phone: '+1234567890' };

function previewBody(body: string): string {
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, SAMPLE.name)
    .replace(/\{\{\s*phone\s*\}\}/gi, SAMPLE.phone);
}

export function Step1ComposePlain({
  draft,
  onChange,
  onNext,
  onBack,
}: Step1ComposePlainProps) {
  const t = useTranslations('Broadcasts.wizard');
  const preview = useMemo(() => previewBody(draft.body), [draft.body]);
  const canContinue = draft.body.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('composePlain.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('composePlain.subtitle')}</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          {t('composePlain.bodyLabel')}
        </label>
        <Textarea
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          placeholder={t('composePlain.bodyPlaceholder')}
          rows={6}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
        <p className="text-xs font-mono text-muted-foreground">{'{{name}}  {{phone}}'}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2 space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('composePlain.mediaLabel')}
          </label>
          <Input
            type="url"
            value={draft.mediaUrl}
            onChange={(e) => onChange({ ...draft, mediaUrl: e.target.value })}
            placeholder={t('composePlain.mediaPlaceholder')}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t('composePlain.mediaKind')}
          </label>
          <Select
            value={draft.mediaKind}
            onValueChange={(val) =>
              onChange({ ...draft, mediaKind: val as PlainMediaKind })
            }
          >
            <SelectTrigger className="w-full border-border bg-muted text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="image">{t('composePlain.mediaImage')}</SelectItem>
              <SelectItem value="video">{t('composePlain.mediaVideo')}</SelectItem>
              <SelectItem value="document">{t('composePlain.mediaDocument')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('composePlain.hint')}</p>

      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">{t('composePlain.preview')}</p>
        </div>
        <div className="rounded-lg bg-[#0e1a12] p-3">
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary/30 px-3 py-2 shadow-sm">
            <p className="whitespace-pre-wrap text-sm text-primary">
              {preview.trim() ? preview : t('composePlain.previewEmpty')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!canContinue}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
