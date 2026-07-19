import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from './queue-processor';
import { WWebJSProvider } from './providers/wwebjs-provider';

// Mock the environment variables needed by QueueProcessor
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');

// Mock the Supabase client
const selectMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: selectMock.mockReturnThis(),
      eq: eqMock.mockReturnThis(),
      order: orderMock.mockReturnThis(),
      limit: limitMock.mockReturnThis(),
      update: updateMock.mockReturnThis(),
    }),
  }),
}));

describe('QueueProcessor', () => {
  let provider: WWebJSProvider;
  let processor: QueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WWebJSProvider();
    vi.spyOn(provider, 'getSessionStatus').mockResolvedValue('connected');
    processor = new QueueProcessor(provider);
  });

  it('fetches accounts and processes pending items', async () => {
    // Mock accounts query
    selectMock.mockResolvedValueOnce({ data: [{ id: 'acc-1', provider_type: 'wwebjs' }] });
    
    // Mock pending items query
    limitMock.mockResolvedValueOnce({
      data: [
        {
          id: 'queue-1',
          account_id: 'acc-1',
          action: 'sendText',
          payload: { to: '123', body: 'hello' },
        },
      ],
    });
    
    // Mock sendText on provider
    vi.spyOn(provider, 'sendText').mockResolvedValue({ messageId: 'meta-msg-1' });

    await processor.processQueue();

    // Verify it marked as processing
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    
    // Verify it called provider.sendText
    expect(provider.sendText).toHaveBeenCalledWith('acc-1', '123', 'hello', undefined);
    
    // Verify it marked as completed
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
  
  it('enforces daily rate limits and warming mode per account (fails if missing)', async () => {
    // We expect the processor to throttle or check limits before dispatching.
    // Currently, it just pulls 10 and blasts them. We write a test that fails when limits are missing.
    selectMock.mockResolvedValueOnce({ data: [{ id: 'acc-1', provider_type: 'wwebjs' }] });
    
    // Simulate 50 pending items
    limitMock.mockResolvedValueOnce({
      data: Array.from({ length: 50 }).map((_, i) => ({
        id: `queue-${i}`,
        account_id: 'acc-1',
        action: 'sendText',
        payload: { to: '123', body: 'hello' },
      })),
    });
    
    vi.spyOn(provider, 'sendText').mockResolvedValue({ messageId: 'msg' });

    await processor.processQueue();
    
    // Since rate governor logic does not exist, this will actually pull 50 (if limit was higher)
    // or just the limit. We can check if it attempts to rate limit.
    // We expect a method like `checkGovernor` to exist, or we can just assert it limits concurrency.
    // For this audit, we will just assert that rate governor is called, which will fail since it doesn't exist.
    expect((processor as any).rateGovernor).toBeDefined(); // Will fail, proving gap.
  });
});
