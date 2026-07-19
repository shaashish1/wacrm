import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { QueueProcessor } from './queue-processor';
import { WWebJSProvider } from './providers/wwebjs-provider';
import { dispatchToWebhook, dispatchStatusToWebhook } from './webhook-dispatcher';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('Worker service starting up...');

async function main() {
  const provider = new WWebJSProvider();
  
  // Register global callbacks
  provider.onInboundMessage(async (accountId, message) => {
    console.log(`[WWebJS] Received message for ${accountId}: ${message.id}`);
    
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
    console.log(`[WWebJS] Status update for ${accountId}: ${status.messageId} -> ${status.status}`);
    
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle();
      
    if (config?.phone_number_id) {
      // WWebJS timestamp is in ms, webhook expects seconds string
      const tsString = Math.floor(status.timestamp / 1000).toString();
      await dispatchStatusToWebhook(accountId, config.phone_number_id, {
        id: status.messageId,
        status: status.status,
        timestamp: tsString,
        recipient_id: status.recipientId?.replace('@c.us', ''),
      });
    }
  });

  // Start all registered sessions
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, provider_type')
    .eq('provider_type', 'wwebjs');

  if (accounts) {
    for (const account of accounts) {
      console.log(`Initializing WWebJS session for account ${account.id}...`);
      await provider.initializeSession(account.id, {});
    }
  }

  // Start Queue processor using the same provider instance
  const processor = new QueueProcessor(provider);
  processor.start(3000); // Poll every 3s
  
  console.log('Worker service is running and ready to process messages.');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
