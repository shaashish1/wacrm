import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from './queue-processor';
import { BaileysProvider } from './providers/baileys-provider';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');

const updateMock = vi.fn().mockReturnThis();
const eqMock = vi.fn().mockReturnThis();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
      update: updateMock,
      maybeSingle: vi.fn(),
    }),
  }),
}));

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  isJidUser: vi.fn(() => true),
  makeCacheableSignalKeyStore: vi.fn((keys) => keys),
  downloadMediaMessage: vi.fn(),
}));

describe('QueueProcessor', () => {
  let provider: BaileysProvider;
  let processor: QueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BaileysProvider();
    vi.spyOn(provider, 'getSessionStatus').mockResolvedValue('connected');
    processor = new QueueProcessor(provider);
  });

  it('creates with provider and has rateGovernor defined', () => {
    expect(processor.rateGovernor).toBeDefined();
  });

  it('rejects job when session is not connected', async () => {
    vi.spyOn(provider, 'getSessionStatus').mockResolvedValue('disconnected');

    const fakeJob = {
      id: 'job-1',
      data: {
        accountId: 'acc-1',
        action: 'sendText',
        payload: { to: '123', body: 'hello' },
      },
    };

    // Access the private processItem via bracket notation
    await expect((processor as any).processItem(fakeJob)).rejects.toThrow('Session not connected');
  });

  it('calls provider.sendText for sendText action', async () => {
    vi.spyOn(provider, 'sendText').mockResolvedValue({ messageId: 'meta-msg-1' });
    vi.spyOn(processor.rateGovernor, 'enforceLimits').mockResolvedValue();

    const fakeJob = {
      id: 'job-1',
      data: {
        accountId: 'acc-1',
        action: 'sendText',
        payload: { to: '123', body: 'hello' },
      },
    };

    await (processor as any).processItem(fakeJob);

    expect(provider.sendText).toHaveBeenCalledWith('acc-1', '123', 'hello', undefined);
  });
});
