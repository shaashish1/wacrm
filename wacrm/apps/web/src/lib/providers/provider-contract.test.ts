import { describe, it, expect, vi } from 'vitest';
import { CloudAPIProvider } from './cloud-api-provider';
import type { IMessagingProvider } from '@wacrm/shared';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  isJidUser: vi.fn(() => true),
  makeCacheableSignalKeyStore: vi.fn((keys: unknown) => keys),
  downloadMediaMessage: vi.fn(),
}));

const mockSupabaseClient = {
  from: () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn(),
    update: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  }),
  rpc: vi.fn(),
  storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabaseClient,
}));

vi.mock('../flows/admin-client', () => ({
  supabaseAdmin: () => mockSupabaseClient,
}));

// Lazy import after mocks are set
const { BaileysProvider } = await import('../../../../worker/src/providers/baileys-provider');

describe('Provider Contract Parity', () => {
  it('CloudAPIProvider implements IMessagingProvider', () => {
    const provider: IMessagingProvider = new CloudAPIProvider();
    expect(provider.getProviderType()).toBe('cloud_api');
  });

  it('BaileysProvider implements IMessagingProvider', () => {
    const provider: IMessagingProvider = new BaileysProvider();
    expect(provider.getProviderType()).toBe('wwebjs');
  });

  describe('Method behavior equivalence', () => {
    const metaProvider = new CloudAPIProvider();
    const baileysProvider = new BaileysProvider();
    const accountId = 'acc-123';
    const phone = '14155550123';

    it('Both handle sendTemplate', async () => {
      const metaPromise = metaProvider.sendTemplate(accountId, phone, 'hello', 'en_US');
      const baileysPromise = baileysProvider.sendTemplate(accountId, phone, 'hello', 'en_US');

      expect(metaPromise).toBeInstanceOf(Promise);
      expect(baileysPromise).toBeInstanceOf(Promise);

      await expect(baileysPromise).rejects.toThrow(/not supported/i);
      await expect(metaPromise).rejects.toThrow();
    });

    it('Both return identical capability shape', () => {
      const metaCap = metaProvider.getCapabilities();
      const baileysCap = baileysProvider.getCapabilities();

      expect(metaCap).toHaveProperty('templates');
      expect(baileysCap).toHaveProperty('templates');

      expect(metaCap.templates).toBe(true);
      expect(baileysCap.templates).toBe(false);
    });
  });
});
