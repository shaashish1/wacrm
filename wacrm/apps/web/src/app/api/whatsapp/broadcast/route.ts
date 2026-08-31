import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder'
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import {
  sanitizePhoneForMeta,
  isValidE164,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  insertSendQueueJobs,
  markRecipientsQueued,
  type SendQueueJobInput,
} from '@/lib/broadcasts/enqueue-send-queue'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import type { MessageTemplate } from '@/types'
import { loadMarketingEligibleIds, NO_CONSENT_MESSAGE } from '@/lib/consent'
import { jitterToMs, normalizeJitterSeconds } from '@/lib/broadcasts/jitter'
import { preflightAudience, reviewCopy } from '@/lib/a2a/compliance'

interface BroadcastResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string
  /** Body variable values, one per {{N}}. Legacy field. */
  params?: string[]
  /**
   * Structured per-send values (header text variable, media URL
   * override, URL/COPY_CODE button values). When set, takes
   * precedence over `params` for the body too — see
   * sendTemplateMessage for the merge rules.
   */
  messageParams?: SendTimeParams
  recipient_id?: string
  broadcast_id?: string
  contact_id?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Per-user broadcast budget. Note: this limits how often a user
    // can *start* a campaign, not how many messages go out inside
    // one — the fan-out loop below runs without additional gating.
    const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    // Resolve the caller's account_id. whatsapp_config + templates
    // + broadcasts are all account-scoped post-multi-user, so the
    // old `.eq('user_id', user.id)` filters miss every row created
    // by a teammate.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      mode,
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_language,
      template_params,
    } = body

    // wwebjs plain-text path: enqueue one sendText/sendMedia job per
    // recipient. Cloud API template broadcasts stay on the branch below.
    if (mode === 'plain') {
      return enqueuePlainTextBroadcast(accountId, body)
    }

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      )
    }

    // Load the template row once so we can pre-build Graph API
    // components per recipient and persist them on send_queue. The
    // worker then POSTs those components without duplicating builder
    // logic. Guard against a malformed local row crashing every enqueue.
    const { data: rawTemplateRow } = await supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', template_name)
      .eq('language', template_language || 'en_US')
      .maybeSingle()
    if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
      return NextResponse.json(
        {
          error:
            'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
        },
        { status: 500 },
      )
    }
    const templateRow = (rawTemplateRow ?? null) as MessageTemplate | null

    const jobs: SendQueueJobInput[] = []
    const queuedIds: string[] = []
    const results: BroadcastResult[] = []
    let sentCount = 0
    let failedCount = 0

    const gateIds = recipients
      .map((r) => r.contact_id)
      .filter((id): id is string => Boolean(id))
    const eligible = await loadMarketingEligibleIds(
      supabase,
      accountId,
      gateIds,
      'whatsapp',
    )

    for (const recipient of recipients) {
      const sanitized = sanitizePhoneForMeta(recipient.phone)

      if (!isValidE164(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'Invalid phone number format',
        })
        failedCount++
        continue
      }

      if (!recipient.contact_id || !eligible.has(recipient.contact_id)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'No marketing consent or opted out',
        })
        failedCount++
        continue
      }

      let components: unknown[] = []
      try {
        if (templateRow) {
          components = buildSendComponents(templateRow, {
            body: recipient.messageParams?.body ?? recipient.params,
            headerText: recipient.messageParams?.headerText,
            headerMediaUrl: recipient.messageParams?.headerMediaUrl,
            headerMediaId: recipient.messageParams?.headerMediaId,
            buttonParams: recipient.messageParams?.buttonParams,
          })
        } else if (recipient.params && recipient.params.length > 0) {
          components = [
            {
              type: 'body',
              parameters: recipient.params.map((p) => ({
                type: 'text',
                text: String(p),
              })),
            },
          ]
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to build template'
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: errorMessage,
        })
        failedCount++
        continue
      }

      jobs.push({
        accountId,
        providerType: 'cloud_api',
        action: 'sendTemplate',
        payload: {
          to: sanitized,
          template_name,
          template_language: template_language || 'en_US',
          components,
          options: {
            broadcastRecipientId: recipient.recipient_id,
            broadcastId: recipient.broadcast_id,
            contactId: recipient.contact_id,
          },
        },
      })
      if (recipient.recipient_id) queuedIds.push(recipient.recipient_id)
      results.push({ phone: recipient.phone, status: 'sent' })
      sentCount++
    }

    await insertSendQueueJobs(jobs)
    await markRecipientsQueued(queuedIds)

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json(
      { error: 'Failed to process broadcast' },
      { status: 500 }
    )
  }
}

interface PlainRecipient {
  phone: string
  body: string
  recipient_id?: string
  broadcast_id?: string
  contact_id?: string
  media?: { url: string; kind?: 'image' | 'video' | 'document' | 'audio' }
}

async function enqueuePlainTextBroadcast(accountId: string, body: {
  recipients?: PlainRecipient[]
  jitterMinSec?: number
  jitterMaxSec?: number
}) {
  const recipients = Array.isArray(body.recipients) ? body.recipients : []
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: '`recipients` must be a non-empty array' },
      { status: 400 },
    )
  }

  const jobs: SendQueueJobInput[] = []
  const queuedIds: string[] = []
  const results: BroadcastResult[] = []
  let sentCount = 0
  let failedCount = 0

  const gateIds = recipients
    .map((r) => r.contact_id)
    .filter((id): id is string => Boolean(id))
  const admin = supabaseAdmin()
  const eligible = await loadMarketingEligibleIds(
    admin,
    accountId,
    gateIds,
    'whatsapp',
  )

  const sampleCopy = recipients.find((r) => r.body)?.body ?? ''
  const copyGate = reviewCopy(sampleCopy)
  if (!copyGate.allow) {
    return NextResponse.json(
      { error: `Compliance blocked send: ${copyGate.violations.join(', ')}` },
      { status: 400 },
    )
  }

  const audienceGate = await preflightAudience(admin, accountId, gateIds, sampleCopy)
  if (audienceGate.eligible_count === 0) {
    return NextResponse.json({ error: NO_CONSENT_MESSAGE }, { status: 400 })
  }

  const { data: accountRow } = await admin
    .from('accounts')
    .select('broadcast_jitter_min_sec, broadcast_jitter_max_sec')
    .eq('id', accountId)
    .maybeSingle()
  const jitter = normalizeJitterSeconds(
    body.jitterMinSec ?? accountRow?.broadcast_jitter_min_sec,
    body.jitterMaxSec ?? accountRow?.broadcast_jitter_max_sec,
  )
  const jitterMs = jitterToMs(jitter)

  for (const recipient of recipients) {
    const phone = typeof recipient.phone === 'string' ? recipient.phone : ''
    const text = typeof recipient.body === 'string' ? recipient.body : ''
    if (!phone || !text) {
      results.push({
        phone: phone || recipient.phone,
        status: 'failed',
        error: 'phone and body are required',
      })
      failedCount++
      continue
    }

    const sanitized = sanitizePhoneForMeta(phone)
    if (!isValidE164(sanitized)) {
      results.push({
        phone,
        status: 'failed',
        error: 'Invalid phone number format',
      })
      failedCount++
      continue
    }

    if (!recipient.contact_id || !eligible.has(recipient.contact_id)) {
      results.push({
        phone,
        status: 'failed',
        error: 'No marketing consent or opted out',
      })
      failedCount++
      continue
    }

    const mediaUrl = recipient.media?.url?.trim()
    const options = {
      broadcastRecipientId: recipient.recipient_id,
      broadcastId: recipient.broadcast_id,
      contactId: recipient.contact_id,
      jitterMinMs: jitterMs.jitterMinMs,
      jitterMaxMs: jitterMs.jitterMaxMs,
    }
    jobs.push({
      accountId,
      providerType: 'wwebjs',
      action: mediaUrl ? 'sendMedia' : 'sendText',
      payload: mediaUrl
        ? {
            to: sanitized,
            kind: recipient.media?.kind || 'image',
            media: { link: mediaUrl },
            caption: text,
            options,
          }
        : { to: sanitized, body: text, options },
    })
    if (recipient.recipient_id) queuedIds.push(recipient.recipient_id)
    results.push({ phone, status: 'sent' })
    sentCount++
  }

  await insertSendQueueJobs(jobs)
  await markRecipientsQueued(queuedIds)

  return NextResponse.json({
    success: true,
    total: recipients.length,
    sent: sentCount,
    failed: failedCount,
    results,
  })
}
