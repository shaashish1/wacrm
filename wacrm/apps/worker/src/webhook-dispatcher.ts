import crypto from 'crypto';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import type { InboundMessage } from '@wacrm/shared';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Create a queue for dispatching webhooks reliably
export const webhookQueue = new Queue('webhook-dispatch', { connection });

// Start the worker to process the webhooks with retries
export function startWebhookDispatcherWorker(): Worker {
  console.log('Starting Webhook Dispatcher Worker...');
  const worker = new Worker('webhook-dispatch', async (job: Job) => {
    const { payload, type } = job.data;
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', META_APP_SECRET).update(body).digest('hex');

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
      },
      body,
    });
    
    if (!res.ok) {
      const errText = await res.text();
      // Throwing error causes BullMQ to retry the job
      throw new Error(`Webhook returned status ${res.status}: ${errText}`);
    }
  }, { 
    connection, 
    concurrency: 5 
  });

  worker.on('failed', (job, err) => {
    console.error(`Webhook Dispatch Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err);
  });

  return worker;
}

/**
 * Transform an InboundMessage (from Baileys/wwebjs provider) into the
 * WhatsApp Cloud API message shape the webhook route expects.
 */
function formatAsMetaMessage(message: InboundMessage): Record<string, unknown> {
  const base = {
    id: message.id,
    from: message.from,
    timestamp: String(message.timestamp),
    type: message.type,
  };

  switch (message.type) {
    case 'text':
      return { ...base, text: { body: message.text ?? '' } };
    case 'image':
      return { ...base, image: { id: message.mediaUrl ?? '', caption: message.text } };
    case 'video':
      return { ...base, video: { id: message.mediaUrl ?? '', caption: message.text } };
    case 'audio':
      return { ...base, audio: { id: message.mediaUrl ?? '' } };
    case 'document':
      return { ...base, document: { id: message.mediaUrl ?? '', caption: message.text } };
    case 'sticker':
      return { ...base, sticker: { id: message.mediaUrl ?? '' } };
    case 'location': {
      let lat = 0, lon = 0;
      const parts = (message.text ?? '').split(' - ');
      const coordsPart = parts[parts.length - 1];
      if (coordsPart && coordsPart.includes(',')) {
        const [latStr, lonStr] = coordsPart.split(',');
        lat = parseFloat(latStr) || 0;
        lon = parseFloat(lonStr) || 0;
      }
      const name = parts.length > 1 ? parts[0] : undefined;
      const address = parts.length > 2 ? parts[1] : undefined;
      return { ...base, location: { latitude: lat, longitude: lon, name, address } };
    }
    default:
      return { ...base, text: { body: message.text ?? '' } };
  }
}

export async function dispatchToWebhook(accountId: string, phoneNumberId: string, message: InboundMessage) {
  const metaMessage = formatAsMetaMessage(message);
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: accountId,
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: 'wwebjs_local', phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: message.pushName || message.from }, wa_id: message.from }],
          messages: [metaMessage],
        },
      }],
    }],
  };

  // Push to local queue for guaranteed delivery
  await webhookQueue.add('inbound-message', { type: 'message', payload }, {
    attempts: 10,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });
}

export async function dispatchStatusToWebhook(accountId: string, phoneNumberId: string, status: any) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: accountId,
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: 'wwebjs_local', phone_number_id: phoneNumberId },
          statuses: [status],
        },
      }],
    }],
  };

  await webhookQueue.add('status-update', { type: 'status', payload }, {
    attempts: 10,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });
}
