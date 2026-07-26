import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateGovernor } from './rate-governor';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    }),
  }),
}));

describe('RateGovernor', () => {
  let governor: RateGovernor;

  beforeEach(() => {
    vi.clearAllMocks();
    governor = new RateGovernor();
  });

  it('allows sending when under daily limit', async () => {
    rpcMock.mockResolvedValue({ data: 10, error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(governor.enforceLimits('acc-1')).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('increment_daily_count', { p_account_id: 'acc-1' });
  });

  it('throws when daily limit is reached', async () => {
    rpcMock.mockResolvedValue({ data: 251, error: null });

    await expect(governor.enforceLimits('acc-1')).rejects.toThrow('Daily message limit');
  });

  it('allows sending when RPC errors (fail-open)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection error' } });

    await expect(governor.enforceLimits('acc-1')).resolves.toBeUndefined();
  });
});
