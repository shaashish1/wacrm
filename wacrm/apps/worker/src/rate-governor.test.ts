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

  it('sleeps 15–60s while a session is warming', async () => {
    rpcMock.mockResolvedValue({ data: 10, error: null });
    maybeSingleMock.mockResolvedValue({
      data: {
        warming_started_at: new Date().toISOString(),
        warming_graduated_at: null,
        last_connected_at: new Date().toISOString(),
      },
      error: null,
    });
    const sleep = vi
      .spyOn(governor as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    await governor.enforceLimits('acc-1', { jitterMinMs: 1000, jitterMaxMs: 3000 });
    expect(sleep).toHaveBeenCalledTimes(1);
    const ms = sleep.mock.calls[0][0];
    expect(ms).toBeGreaterThanOrEqual(15_000);
    expect(ms).toBeLessThanOrEqual(60_000);
    sleep.mockRestore();
  });

  it('uses caller-supplied jitter after warming (not a hardcoded 1–3s)', async () => {
    rpcMock.mockResolvedValue({ data: 10, error: null });
    maybeSingleMock.mockResolvedValue({
      data: {
        warming_started_at: null,
        warming_graduated_at: new Date().toISOString(),
        last_connected_at: 'already-seen',
      },
      error: null,
    });
    (governor as unknown as { firstSendSeen: Map<string, string> }).firstSendSeen.set(
      'acc-1',
      'already-seen',
    );
    const sleep = vi
      .spyOn(governor as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    await governor.enforceLimits('acc-1', { jitterMinMs: 5000, jitterMaxMs: 9000 });
    expect(sleep).toHaveBeenCalled();
    const ms = sleep.mock.calls[0][0];
    expect(ms).toBeGreaterThanOrEqual(5000);
    expect(ms).toBeLessThanOrEqual(9400);
    sleep.mockRestore();
  });
});
