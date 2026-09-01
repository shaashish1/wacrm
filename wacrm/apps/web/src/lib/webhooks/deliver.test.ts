import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./ssrf', () => ({
  isDeliverableUrl: vi.fn(async () => true),
}));

import { encrypt } from '../whatsapp/encryption';
import {
  dispatchWebhookEvent,
  drainWebhookDeliveries,
  MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_MAX_ATTEMPTS,
} from './deliver';
import { isDeliverableUrl } from './ssrf';

const SECRET_OK = encrypt('hook-secret');

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  is_active?: boolean;
}

interface DeliveryInsert {
  endpoint_id: string;
  event: string;
  payload: { id: string; event: string };
  status: string;
}

interface Calls {
  inserts: DeliveryInsert[];
  updates: { table: string; id: string; payload: Record<string, unknown> }[];
  rpcs: { name: string; args: Record<string, unknown> }[];
}

function makeDb(opts: {
  endpoints?: EndpointRow[];
  claimed?: Array<{
    id: string;
    account_id: string;
    endpoint_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>;
  calls: Calls;
}) {
  const endpoints = opts.endpoints ?? [];
  const byId = new Map(endpoints.map((e) => [e.id, e]));

  const from = (table: string) => {
    let mode: 'select' | 'update' | 'insert' = 'select';
    let payload: Record<string, unknown> = {};
    let id: string | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: string) => {
        if (col === 'id') id = val;
        return b;
      },
      update: (p: Record<string, unknown>) => {
        mode = 'update';
        payload = p;
        return b;
      },
      insert: (rows: DeliveryInsert[]) => {
        mode = 'insert';
        opts.calls.inserts.push(...rows);
        return Promise.resolve({ data: rows, error: null });
      },
      contains: () => Promise.resolve({ data: endpoints, error: null }),
      maybeSingle: () => {
        const row = id ? byId.get(id) ?? null : null;
        return Promise.resolve({ data: row, error: null });
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (mode === 'update' && id) {
          opts.calls.updates.push({ table, id, payload });
        }
        return resolve({ data: null, error: null });
      },
    };
    return b;
  };

  const rpc = (name: string, args: Record<string, unknown>) => {
    opts.calls.rpcs.push({ name, args });
    if (name === 'claim_webhook_deliveries') {
      return Promise.resolve({ data: opts.claimed ?? [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  return { from, rpc } as unknown as SupabaseClient;
}

const emptyCalls = (): Calls => ({ inserts: [], updates: [], rpcs: [] });

function claimedFromInserts(inserts: DeliveryInsert[]) {
  return inserts.map((row, i) => ({
    id: `del-${i}`,
    account_id: 'acct-1',
    endpoint_id: row.endpoint_id,
    event: row.event,
    payload: row.payload,
    attempts: 0,
    max_attempts: WEBHOOK_MAX_ATTEMPTS,
  }));
}

beforeEach(() => {
  vi.mocked(isDeliverableUrl).mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('dispatchWebhookEvent', () => {
  it('enqueues a durable row, signs + POSTs, and resets failure_count on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    const endpoints = [{ id: 'a', url: 'https://a.test/hook', secret: SECRET_OK, is_active: true }];

    const db = makeDb({
      endpoints,
      get claimed() {
        return claimedFromInserts(calls.inserts);
      },
      calls,
    });

    await dispatchWebhookEvent(db, 'acct-1', 'message.received', { x: 1 });

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].endpoint_id).toBe('a');
    expect(calls.inserts[0].payload.id).toMatch(/[0-9a-f-]{36}/);
    expect(calls.rpcs.some((r) => r.name === 'claim_webhook_deliveries')).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.test/hook');
    expect(opts.redirect).toBe('manual');
    expect(opts.headers['X-Wacrm-Event']).toBe('message.received');
    expect(opts.headers['X-Wacrm-Signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(JSON.parse(opts.body).id).toBe(calls.inserts[0].payload.id);
    expect(
      calls.updates.find((u) => u.table === 'webhook_endpoints' && u.id === 'a')
    ).toMatchObject({ payload: { failure_count: 0 } });
    expect(
      calls.updates.find((u) => u.table === 'webhook_deliveries')
    ).toMatchObject({ payload: { status: 'delivered' } });
  });

  it('records an atomic failure and re-queues with backoff when the endpoint errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const calls = emptyCalls();
    const endpoints = [{ id: 'b', url: 'https://b.test/hook', secret: SECRET_OK, is_active: true }];
    const db = makeDb({
      endpoints,
      get claimed() {
        return claimedFromInserts(calls.inserts);
      },
      calls,
    });

    await dispatchWebhookEvent(db, 'acct-1', 'message.received', {});

    expect(calls.rpcs.find((r) => r.name === 'record_webhook_failure')).toEqual({
      name: 'record_webhook_failure',
      args: { endpoint_id: 'b', max_failures: MAX_CONSECUTIVE_FAILURES },
    });
    const retry = calls.updates.find(
      (u) => u.table === 'webhook_deliveries' && u.payload.status === 'pending'
    );
    expect(retry).toBeTruthy();
    expect(retry?.payload.attempts).toBe(1);
    expect(typeof retry?.payload.next_attempt_at).toBe('string');
  });

  it('fails permanently (no retry) when the target is not public', async () => {
    vi.mocked(isDeliverableUrl).mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    const endpoints = [{ id: 'c', url: 'https://127.0.0.1/hook', secret: SECRET_OK, is_active: true }];
    const db = makeDb({
      endpoints,
      get claimed() {
        return claimedFromInserts(calls.inserts);
      },
      calls,
    });

    await dispatchWebhookEvent(db, 'acct-1', 'message.received', {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.rpcs.some((r) => r.name === 'record_webhook_failure')).toBe(true);
    expect(
      calls.updates.find((u) => u.table === 'webhook_deliveries')
    ).toMatchObject({ payload: { status: 'failed' } });
  });

  it('does nothing when no endpoints are subscribed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    await dispatchWebhookEvent(makeDb({ endpoints: [], claimed: [], calls }), 'acct-1', 'message.received', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(calls.rpcs.filter((r) => r.name === 'record_webhook_failure')).toHaveLength(0);
  });
});

describe('drainWebhookDeliveries', () => {
  it('skips an inactive endpoint without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    const result = await drainWebhookDeliveries(
      makeDb({
        endpoints: [{ id: 'd', url: 'https://d.test/hook', secret: SECRET_OK, is_active: false }],
        claimed: [
          {
            id: 'del-1',
            account_id: 'acct-1',
            endpoint_id: 'd',
            event: 'message.received',
            payload: { id: 'same', event: 'message.received' },
            attempts: 0,
            max_attempts: 8,
          },
        ],
        calls,
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(
      calls.updates.find((u) => u.table === 'webhook_deliveries')
    ).toMatchObject({ payload: { status: 'skipped' } });
  });

  it('marks failed when the retry budget is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response));
    const calls = emptyCalls();
    const result = await drainWebhookDeliveries(
      makeDb({
        endpoints: [{ id: 'e', url: 'https://e.test/hook', secret: SECRET_OK, is_active: true }],
        claimed: [
          {
            id: 'del-2',
            account_id: 'acct-1',
            endpoint_id: 'e',
            event: 'conversation.created',
            payload: { id: 'p2' },
            attempts: 7,
            max_attempts: 8,
          },
        ],
        calls,
      })
    );
    expect(result.failed).toBe(1);
    expect(
      calls.updates.find((u) => u.table === 'webhook_deliveries')
    ).toMatchObject({ payload: { status: 'failed', attempts: 8 } });
  });

  it('fails permanently when the signing secret cannot be decrypted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    const result = await drainWebhookDeliveries(
      makeDb({
        endpoints: [{ id: 'f', url: 'https://f.test/hook', secret: 'bad-secret', is_active: true }],
        claimed: [
          {
            id: 'del-3',
            account_id: 'acct-1',
            endpoint_id: 'f',
            event: 'message.status_updated',
            payload: { id: 'p3' },
            attempts: 0,
            max_attempts: 8,
          },
        ],
        calls,
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(calls.rpcs.some((r) => r.name === 'record_webhook_failure')).toBe(true);
  });
});
