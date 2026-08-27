import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export class RateGovernor {
  private supabase;

  private readonly DAILY_LIMIT = 250;
  private readonly WARMING_JITTER_MIN_MS = 15000;
  private readonly WARMING_JITTER_MAX_MS = 60000;
  private readonly FIRST_SEND_MIN_MS = 15000;
  private readonly FIRST_SEND_MAX_MS = 20000;
  private readonly WARMING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

  /** last_connected_at we already delayed for, per account (this process). */
  private firstSendSeen = new Map<string, string>();

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  /**
   * Checks if the account is allowed to send a message right now.
   * Enforces daily caps and sleeps a jitter window:
   *   - 15–60s while the session is in the 7-day warming window
   *   - 15–20s on the first outbound after a connect (this worker)
   *   - otherwise the caller-supplied jitter (broadcasts: 1–3s)
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

    const jitter = await this.resolveJitter(accountId, options);
    if (jitter) {
      await this.sleep(jitter.min + Math.random() * (jitter.max - jitter.min));
    }
  }

  private async resolveJitter(
    accountId: string,
    options?: { jitterMinMs?: number; jitterMaxMs?: number },
  ): Promise<{ min: number; max: number } | null> {
    const { data: session } = await this.supabase
      .from('sessions')
      .select('warming_started_at, warming_graduated_at, last_connected_at')
      .eq('account_id', accountId)
      .maybeSingle();

    const now = Date.now();
    let warming = false;
    if (session?.warming_started_at && !session.warming_graduated_at) {
      const started = new Date(session.warming_started_at).getTime();
      if (Number.isFinite(started) && now - started < this.WARMING_PERIOD_MS) {
        warming = true;
      } else if (Number.isFinite(started)) {
        await this.supabase
          .from('sessions')
          .update({ warming_graduated_at: new Date().toISOString() })
          .eq('account_id', accountId);
      }
    }

    const connectedAt =
      typeof session?.last_connected_at === 'string' ? session.last_connected_at : null;
    const isFirstAfterConnect =
      Boolean(connectedAt) && this.firstSendSeen.get(accountId) !== connectedAt;
    if (isFirstAfterConnect && connectedAt) {
      this.firstSendSeen.set(accountId, connectedAt);
    }

    if (warming) {
      return { min: this.WARMING_JITTER_MIN_MS, max: this.WARMING_JITTER_MAX_MS };
    }
    if (isFirstAfterConnect) {
      return { min: this.FIRST_SEND_MIN_MS, max: this.FIRST_SEND_MAX_MS };
    }

    const min = options?.jitterMinMs;
    const max = options?.jitterMaxMs;
    if (
      typeof min === 'number' &&
      typeof max === 'number' &&
      max >= min &&
      min >= 0
    ) {
      return { min, max };
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
