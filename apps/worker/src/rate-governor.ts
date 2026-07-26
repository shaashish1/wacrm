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
   * Enforces daily caps and applies jitter delays during warming mode.
   * Returns a promise that resolves when it's safe to send, or throws if daily cap is reached.
   */
  async enforceLimits(accountId: string): Promise<void> {
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

    const { data: session } = await this.supabase
      .from('sessions')
      .select('warming_started_at, warming_graduated_at')
      .eq('account_id', accountId)
      .maybeSingle();

    if (session) {
      const now = new Date();
      const isWarming = session.warming_started_at && !session.warming_graduated_at;
      const startedAt = session.warming_started_at ? new Date(session.warming_started_at).getTime() : 0;

      if (isWarming || (startedAt > 0 && now.getTime() - startedAt < this.WARMING_PERIOD_MS)) {
        const jitter = Math.floor(Math.random() * (this.WARMING_JITTER_MAX_MS - this.WARMING_JITTER_MIN_MS + 1) + this.WARMING_JITTER_MIN_MS);
        await this.sleep(jitter);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
