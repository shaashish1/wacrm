import dotenv from 'dotenv';
import path from 'path';

// Production: real process env wins. Local fallbacks: cwd `.env`, then web `.env.local`.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../web/.env.local') });
}

import { createClient } from '@supabase/supabase-js';
import { QueueProcessor } from './queue-processor';
import { SendQueueDrainer } from './send-queue-drainer';
import { WebhookDeliveryDrainer } from './webhook-delivery-drainer';
import { BaileysProvider } from './providers/baileys-provider';
import { startWebhookDispatcherWorker, dispatchToWebhook, dispatchStatusToWebhook } from './webhook-dispatcher';
import { httpServer, io } from './socket';
import { isOptOutText } from './opt-out';
import { revokeMarketingConsent } from './consent';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('Worker service starting up...');

let provider: BaileysProvider;
let processor: QueueProcessor;
let sendQueueDrainer: SendQueueDrainer;
let webhookDeliveryDrainer: WebhookDeliveryDrainer;
let webhookWorker: any;

async function main() {
  provider = new BaileysProvider();
  
  // Register global callbacks
  provider.onInboundMessage(async (accountId, message) => {
    console.log(`[Baileys] Received message for ${accountId}: ${message.id}`);

    if (isOptOutText(message.text)) {
      const phone = String(message.from || '').replace(/\D/g, '');
      if (phone) {
        const { error } = await supabase
          .from('contacts')
          .update({ opted_out: true, opted_out_at: new Date().toISOString() })
          .eq('account_id', accountId)
          .eq('phone_normalized', phone);
        if (error) {
          console.warn('[Baileys] opt-out update failed:', error.message);
        } else {
          await revokeMarketingConsent(supabase, accountId, {
            phoneNormalized: phone,
          });
          console.log(`[Baileys] Contact ${phone} opted out for ${accountId}`);
        }
      }
    }
    
    // Fetch phone_number_id from config to construct webhook payload
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle();
      
    if (config?.phone_number_id) {
      await dispatchToWebhook(accountId, config.phone_number_id, message);
    }
  });

  provider.onMessageStatus(async (accountId, status) => {
    console.log(`[Baileys] Status update for ${accountId}: ${status.messageId} -> ${status.status}`);
    
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle();
      
    if (config?.phone_number_id) {
      const tsString = Math.floor(status.timestamp / 1000).toString();
      await dispatchStatusToWebhook(accountId, config.phone_number_id, {
        id: status.messageId,
        status: status.status,
        timestamp: tsString,
        recipient_id: status.recipientId,
      });
    }
  });

  provider.onSessionEvent((accountId, event) => {
    console.log(`[Baileys] Session event for ${accountId}: ${event.type}`);
  });

  // Start all registered sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('account_id, config')
    .eq('provider_type', 'wwebjs');

  if (sessions) {
    for (const session of sessions) {
      console.log(`Initializing Baileys session for account ${session.account_id}...`);
      await provider.initializeSession(session.account_id, session.config || {});
    }
  }

  // Start Queue processor using the same provider instance
  processor = new QueueProcessor(provider);
  processor.start();

  sendQueueDrainer = new SendQueueDrainer(
    provider,
    processor.rateGovernor,
    (broadcastId) => processor.maybeFinalizeBroadcast(broadcastId),
  );
  sendQueueDrainer.start();

  webhookDeliveryDrainer = new WebhookDeliveryDrainer();
  webhookDeliveryDrainer.start();

  // Start Webhook Dispatcher
  webhookWorker = startWebhookDispatcherWorker();
  
  // Start Socket.IO Server
  const PORT = process.env.WORKER_SOCKET_PORT || 4000;
  
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    
    socket.on('join', (accountId: string) => {
      console.log(`[Socket.IO] Client ${socket.id} joining room ${accountId}`);
      socket.join(accountId);

      provider.getSessionStatus(accountId).then((status) => {
        const qr = provider.getLastQr(accountId);
        const roomSize = io.sockets.adapter.rooms.get(accountId)?.size ?? 0;
        console.log('[Socket.IO] join', {
          accountIdPrefix: String(accountId).slice(0, 8),
          status,
          roomSize,
          hasQr: !!qr,
          qrLen: qr?.length ?? 0,
        });
        socket.emit('status', { status });
        if (qr) {
          socket.emit('qr_refresh', qr);
        }
      }).catch(() => {});
    });
    
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Socket.IO server listening on port ${PORT}`);
  });

  console.log('Worker service is running and ready to process messages.');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
  try {
    if (sendQueueDrainer) await sendQueueDrainer.stop();
    if (webhookDeliveryDrainer) await webhookDeliveryDrainer.stop();
    if (processor) await processor.stop();
    if (webhookWorker) await webhookWorker.close();
    if (provider) await provider.closeAll();
    httpServer.close();
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
  }
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
