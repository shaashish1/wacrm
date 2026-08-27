'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { ArrowRight, Eye, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
  deleteAccountMedia,
} from '@/lib/storage/upload-media';

const CHAT_MEDIA_BUCKET = 'chat-media';

export type PlainMediaKind = 'image' | 'video' | 'document';

export interface PlainTextDraft {
  body: string;
  mediaUrl: string;
  mediaKind: PlainMediaKind;
  mediaPath?: string;
  mediaFilename?: string;
}

interface Step1ComposePlainProps {
  draft: PlainTextDraft;
  onChange: (draft: PlainTextDraft) => void;
  onNext: () => void;
  onBack: () => void;
}

const SAMPLE = { name: 'John Doe', phone: '+1234567890' };

const PICKER_ACCEPT =
  'image/png,image/jpeg,image/webp,video/mp4,video/3gpp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

function previewBody(body: string): string {
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, SAMPLE.name)
    .replace(/\{\{\s*phone\s*\}\}/gi, SAMPLE.phone);
}

function kindFromFile(file: File): PlainMediaKind {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    const kind = kindFromFile(file);
    const cap = MEDIA_MAX_BYTES_BY_KIND[kind];
    if (file.size > cap) {
      toast.error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — ${kind} limit is ${(cap / 1024 / 1024).toFixed(0)} MB.`,
      );
      return;
    }
    setUploading(true);
    try {
      if (draft.mediaPath) {
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, draft.mediaPath).catch(() => {});
      }
      const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      onChange({
        ...draft,
        mediaUrl: publicUrl,
        mediaKind: kind,
        mediaPath: path,
        mediaFilename: file.name,
      });
      toast.success(t('composePlain.uploadOk'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composePlain.uploadFail'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function clearMedia() {
    if (draft.mediaPath) {
      void deleteAccountMedia(CHAT_MEDIA_BUCKET, draft.mediaPath).catch(() => {});
    }
    onChange({
      ...draft,
      mediaUrl: '',
      mediaPath: undefined,
      mediaFilename: undefined,
    });
  }

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

      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">
          {t('composePlain.mediaLabel')}
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept={PICKER_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {draft.mediaUrl ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
            <Paperclip className="h-4 w-4 shrink-0 text-primary" />
            <a
              href={draft.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-foreground hover:underline"
              title={draft.mediaFilename || draft.mediaUrl}
            >
              {draft.mediaFilename || draft.mediaUrl}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={clearMedia}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="border-border text-muted-foreground"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t('composePlain.uploadFile')}
          </Button>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-2">
            <label className="block text-xs text-muted-foreground">
              {t('composePlain.mediaUrlFallback')}
            </label>
            <Input
              type="url"
              value={draft.mediaPath ? '' : draft.mediaUrl}
              onChange={(e) =>
                onChange({
                  ...draft,
                  mediaUrl: e.target.value,
                  mediaPath: undefined,
                  mediaFilename: undefined,
                })
              }
              placeholder={t('composePlain.mediaPlaceholder')}
              disabled={Boolean(draft.mediaPath)}
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
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
