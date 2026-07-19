import crypto from 'crypto';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';
const META_APP_SECRET = process.env.META_APP_SECRET || '';

export async function dispatchToWebhook(accountId: string, phoneNumberId: string, message: any) {
  // Construct a payload matching Meta's Cloud API webhook format
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: accountId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: 'wwebjs_local',
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: {
                    name: 'WWebJS Contact',
                  },
                  wa_id: message.from.replace('@c.us', ''),
                },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', META_APP_SECRET).update(body).digest('hex');

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
      },
      body,
    });
    if (!res.ok) {
      console.error(`Webhook returned status ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to dispatch webhook:', err);
  }
}

export async function dispatchStatusToWebhook(accountId: string, phoneNumberId: string, status: any) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: accountId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: 'wwebjs_local',
                phone_number_id: phoneNumberId,
              },
              statuses: [status],
            },
          },
        ],
      },
    ],
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', META_APP_SECRET).update(body).digest('hex');

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
      },
      body,
    });
    if (!res.ok) {
      console.error(`Status webhook returned status ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to dispatch status webhook:', err);
  }
}
