import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { QueueProcessor } from './queue-processor';
import { BaileysProvider } from './providers/baileys-provider';
import { startWebhookDispatcherWorker, dispatchToWebhook, dispatchStatusToWebhook } from './webhook-dispatcher';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('Worker service starting up...');

let provider: BaileysProvider;
let processor: QueueProcessor;
let webhookWorker: any;

async function main() {
  provider = new BaileysProvider();
  
  // Register global callbacks
  provider.onInboundMessage(async (accountId, message) => {
    console.log(`[Baileys] Received message for ${accountId}: ${message.id}`);
    
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
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, provider_type')
    .eq('provider_type', 'wwebjs');

  if (accounts) {
    for (const account of accounts) {
      console.log(`Initializing Baileys session for account ${account.id}...`);
      await provider.initializeSession(account.id, {});
    }
  }

  // Start Queue processor using the same provider instance
  processor = new QueueProcessor(provider);
  processor.start();

  // Start Webhook Dispatcher
  webhookWorker = startWebhookDispatcherWorker();
  
  console.log('Worker service is running and ready to process messages.');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
  try {
    if (processor) await processor.stop();
    if (webhookWorker) await webhookWorker.close();
    if (provider) await provider.closeAll();
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
  }
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
