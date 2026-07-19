import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// These tests require a running local Supabase instance.
// If it's not running, the test fails, which is fine for our Phase 3 proof of failure.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

describe('Database RLS Tenant Isolation', () => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  let tenantAUserId: string;
  let tenantAAccountId: string;
  let tenantAToken: string;
  
  let tenantBUserId: string;
  let tenantBAccountId: string;
  let tenantBToken: string;

  beforeAll(async () => {
    // 1. Create Tenant A
    const { data: userA, error: errA } = await adminClient.auth.admin.createUser({
      email: 'tenant.a@example.com',
      password: 'password123',
      email_confirm: true,
    });
    if (errA || !userA.user) {
      // If we can't connect, test fails here.
      console.warn('Could not create test user, is Supabase running?', errA);
      return;
    }
    tenantAUserId = userA.user.id;
    
    const { data: profileA } = await adminClient.from('profiles').select('account_id').eq('user_id', tenantAUserId).single();
    tenantAAccountId = profileA?.account_id;

    // Login A to get session token
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sessionA } = await clientA.auth.signInWithPassword({
      email: 'tenant.a@example.com',
      password: 'password123',
    });
    tenantAToken = sessionA?.session?.access_token || '';

    // 2. Create Tenant B
    const { data: userB, error: errB } = await adminClient.auth.admin.createUser({
      email: 'tenant.b@example.com',
      password: 'password123',
      email_confirm: true,
    });
    tenantBUserId = userB?.user?.id || '';
    
    const { data: profileB } = await adminClient.from('profiles').select('account_id').eq('user_id', tenantBUserId).single();
    tenantBAccountId = profileB?.account_id;

    // Login B to get session token
    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sessionB } = await clientB.auth.signInWithPassword({
      email: 'tenant.b@example.com',
      password: 'password123',
    });
    tenantBToken = sessionB?.session?.access_token || '';
  });

  it('Tenant A cannot read Tenant B sessions', async () => {
    // Seed a session for Tenant B
    await adminClient.from('sessions').insert({
      account_id: tenantBAccountId,
      status: 'connected',
    });

    // Tenant A attempts to read all sessions
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${tenantAToken}` } },
    });

    const { data: sessions, error } = await clientA.from('sessions').select('*');
    
    expect(error).toBeNull();
    // Should return 0 rows for Tenant B's data
    const tenantBSessions = sessions?.filter(s => s.account_id === tenantBAccountId);
    expect(tenantBSessions).toHaveLength(0);
  });

  it('Tenant A cannot write to Tenant B send_queue', async () => {
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${tenantAToken}` } },
    });

    // Tenant A attempts to insert a queue item for Tenant B
    const { error } = await clientA.from('send_queue').insert({
      account_id: tenantBAccountId,
      action: 'sendText',
      payload: {},
      status: 'pending',
    });

    // RLS should reject this insert (usually via violating row-level security policy)
    // Supabase returns an error for violated insert policies.
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/new row violates row-level security policy/i);
  });
});
