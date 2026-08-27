import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export class RateGovernor {
  private supabase;

  // Configuration for limits
  private readonly DAILY_LIMIT = 250;
  private readonly WARMING_JITTER_MIN_MS = 15000;
  private readonly WARMING_JITTER_MAX_MS = 60000;
  
  // 7 days warming period
  private readonly WARMING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  /**
   * Checks if the account is allowed to send a message right now.
   * Enforces daily caps and optionally sleeps a jitter window (used
   * to space wwebjs broadcast sends 1–3s apart).
   * Returns a promise that resolves when it's safe to send, or throws if daily cap is reached.
   */
  async enforceLimits(
    accountId: string,
    options?: { jitterMinMs?: number; jitterMaxMs?: number },
  ): Promise<void> {
    const { data: count, error } = await this.supabase.rpc('increment_daily_count', {
      p_account_id: accountId,
    });

    if (error) {
      console.error('[RateGovernor] increment_daily_count failed:', error);
      return;
    }

    if (count > this.DAILY_LIMIT) {
      throw new Error('Daily message limit reached for this account.');
    }

    const min = options?.jitterMinMs;
    const max = options?.jitterMaxMs;
    if (
      typeof min === 'number' &&
      typeof max === 'number' &&
      max >= min &&
      min >= 0
    ) {
      await this.sleep(min + Math.random() * (max - min));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
