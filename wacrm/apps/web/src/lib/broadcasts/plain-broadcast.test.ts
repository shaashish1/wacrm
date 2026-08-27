import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAndEnqueuePlainBroadcast } from './plain-broadcast';
import { BroadcastError } from '@/lib/whatsapp/broadcast-core';

const db = {} as SupabaseClient;

describe('createAndEnqueuePlainBroadcast validation', () => {
  it('rejects an empty body', async () => {
    await expect(
      createAndEnqueuePlainBroadcast(db, 'acc', 'user', {
        body: '   ',
        recipients: [{ to: '+14155550123' }],
      }),
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 });
  });

  it('rejects when neither recipients nor audience is provided', async () => {
    await expect(
      createAndEnqueuePlainBroadcast(db, 'acc', 'user', { body: 'hello' }),
    ).rejects.toBeInstanceOf(BroadcastError);
  });
});
