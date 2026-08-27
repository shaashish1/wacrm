'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import {
  Step1ComposePlain,
  type PlainTextDraft,
} from '@/components/broadcasts/step1-compose-plain';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import {
  resolveProviderType,
  useBroadcastSending,
  type ProviderType,
} from '@/hooks/use-broadcast-sending';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

const cloudSteps = [
  { label: 'template', key: 'template' },
  { label: 'audience', key: 'audience' },
  { label: 'personalize', key: 'personalize' },
  { label: 'send', key: 'send' },
] as const;

const wwebjsSteps = [
  { label: 'compose', key: 'compose' },
  { label: 'audience', key: 'audience' },
  { label: 'send', key: 'send' },
] as const;

export default function NewBroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <NewBroadcastWizard />
    </Suspense>
  );
}

function NewBroadcastWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft');
  const t = useTranslations('Broadcasts.new');
  const { accountId } = useAuth();
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();

  const [providerType, setProviderType] = useState<ProviderType | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [plainDraft, setPlainDraft] = useState<PlainTextDraft>({
    body: '',
    mediaUrl: '',
    mediaKind: 'image',
  });
  const [audience, setAudience] = useState<{
    type: 'all' | 'tags' | 'custom_field' | 'csv' | 'group';
    tagIds?: string[];
    groupIds?: string[];
    customField?: {
      fieldId: string;
      operator: 'is' | 'is_not' | 'contains';
      value: string;
    };
    csvContacts?: { phone: string; name?: string }[];
    excludeTagIds?: string[];
  }>({ type: 'all' });
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    resolveProviderType(accountId).then((type) => {
      if (!cancelled) setProviderType(type);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    if (!draftId || !accountId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', draftId)
        .eq('status', 'draft')
        .maybeSingle();
      if (cancelled || !data) return;
      setName(data.name ?? '');
      const filter = (data.audience_filter ?? {}) as typeof audience;
      setAudience({
        type: filter.type === 'group' || filter.type === 'tags' || filter.type === 'custom_field' || filter.type === 'csv'
          ? filter.type
          : 'all',
        tagIds: filter.tagIds,
        groupIds: filter.groupIds,
        customField: filter.customField,
        excludeTagIds: filter.excludeTagIds,
      });
      if (data.template_name === 'plain_text') {
        const vars = (data.template_variables ?? {}) as {
          body?: string;
          mediaUrl?: string;
          mediaKind?: PlainTextDraft['mediaKind'];
        };
        setPlainDraft({
          body: vars.body ?? '',
          mediaUrl: vars.mediaUrl ?? '',
          mediaKind: vars.mediaKind ?? 'image',
        });
      } else {
        const vars = (data.template_variables ?? {}) as Record<
          string,
          { type: 'static' | 'field' | 'custom_field'; value: string }
        >;
        setVariables(vars);
        const supabase2 = createClient();
        const { data: tmpl } = await supabase2
          .from('message_templates')
          .select('*')
          .eq('account_id', accountId)
          .eq('name', data.template_name)
          .eq('language', data.template_language ?? 'en_US')
          .maybeSingle();
        if (!cancelled && tmpl) setTemplate(tmpl as MessageTemplate);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, accountId]);

  const isWwebjs = providerType === 'wwebjs';
  const steps = isWwebjs ? wwebjsSteps : cloudSteps;

  async function handleSend(
    scheduledAt?: string | null,
    recurrence?: 'daily' | 'weekly' | null,
  ) {
    if (isWwebjs) {
      if (!plainDraft.body.trim()) return;
    } else if (!template) {
      return;
    }

    try {
      const broadcastId = await createAndSendBroadcast({
        name,
        template: isWwebjs ? null : template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          groupIds: audience.groupIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        variables,
        headerMediaUrl,
        scheduledAt,
        recurrence,
        ...(isWwebjs
          ? {
              plainText: {
                body: plainDraft.body,
                mediaUrl: plainDraft.mediaUrl.trim() || undefined,
                mediaKind: plainDraft.mediaKind,
              },
            }
          : {}),
      });
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      // Previously swallowed with console.error — the wizard would
      // just no-op, leaving the user confused. Surface the reason.
      const message = err instanceof Error ? err.message : 'Broadcast failed';
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  /**
   * Writes a draft broadcast row — no recipients, no sending. The user
   * can revisit it via the list page to finish the flow later. We
   * don't persist the in-progress audience/variable config here
   * because the current schema doesn't carry it past `audience_filter`
   * and `template_variables`; those are enough for the user to
   * recognize the draft but not to exactly round-trip into the wizard.
   * A full resume-draft UX is a future polish.
   */
  async function handleSaveDraft() {
    if (!name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    if (!isWwebjs && !template) {
      toast.error(t('toastGiveName'));
      return;
    }
    if (isWwebjs && !plainDraft.body.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      toast.error(t('toastNotSignedIn'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }

    const { error } = await supabase.from('broadcasts').insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      template_name: isWwebjs ? 'plain_text' : template!.name,
      template_language: isWwebjs ? 'en' : (template!.language ?? 'en_US'),
      template_variables: isWwebjs
        ? {
            body: plainDraft.body,
            mediaUrl: plainDraft.mediaUrl.trim() || null,
            mediaKind: plainDraft.mediaKind,
          }
        : variables,
      audience_filter: {
        type: audience.type,
        tagIds: audience.tagIds,
        groupIds: audience.groupIds,
        customField: audience.customField,
        excludeTagIds: audience.excludeTagIds,
      },
      status: 'draft',
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    });

    if (error) {
      toast.error(t('toastFailedDraft', { error: error.message }));
      return;
    }
    toast.success(t('toastDraftSaved'));
    router.push('/broadcasts');
  }

  if (!providerType) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/broadcasts"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('backToList')}
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isWwebjs ? t('subtitleWwebjs') : t('subtitle')}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'border border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {t(`steps.${step.label}`)}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{
            opacity: isProcessing ? 0.6 : 1,
            pointerEvents: isProcessing ? 'none' : 'auto',
          }}
        >
          {isWwebjs ? (
            <>
              {currentStep === 0 && (
                <Step1ComposePlain
                  draft={plainDraft}
                  onChange={setPlainDraft}
                  onNext={() => setCurrentStep(1)}
                  onBack={() => router.push('/broadcasts')}
                />
              )}
              {currentStep === 1 && (
                <Step2SelectAudience
                  audience={audience}
                  onUpdate={setAudience}
                  onNext={() => setCurrentStep(2)}
                  onBack={() => setCurrentStep(0)}
                />
              )}
              {currentStep === 2 && (
                <Step4ScheduleSend
                  name={name}
                  onNameChange={setName}
                  isPlainText
                  plainTextPreview={plainDraft.body}
                  audience={audience}
                  onSend={handleSend}
                  onSaveDraft={handleSaveDraft}
                  onBack={() => setCurrentStep(1)}
                  isProcessing={isProcessing}
                  progress={progress}
                />
              )}
            </>
          ) : (
            <>
              {currentStep === 0 && (
                <Step1ChooseTemplate
                  selectedTemplate={template}
                  onSelect={setTemplate}
                  onNext={() => setCurrentStep(1)}
                  onBack={() => router.push('/broadcasts')}
                />
              )}
              {currentStep === 1 && (
                <Step2SelectAudience
                  audience={audience}
                  onUpdate={setAudience}
                  onNext={() => setCurrentStep(2)}
                  onBack={() => setCurrentStep(0)}
                />
              )}
              {currentStep === 2 && template && (
                <Step3Personalize
                  template={template}
                  variables={variables}
                  onUpdate={setVariables}
                  headerMediaUrl={headerMediaUrl}
                  onHeaderMediaUrlChange={setHeaderMediaUrl}
                  onNext={() => setCurrentStep(3)}
                  onBack={() => setCurrentStep(1)}
                />
              )}
              {currentStep === 3 && template && (
                <Step4ScheduleSend
                  name={name}
                  onNameChange={setName}
                  template={template}
                  audience={audience}
                  onSend={handleSend}
                  onSaveDraft={handleSaveDraft}
                  onBack={() => setCurrentStep(2)}
                  isProcessing={isProcessing}
                  progress={progress}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
