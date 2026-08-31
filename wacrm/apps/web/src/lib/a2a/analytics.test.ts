import { describe, expect, it } from 'vitest';
import { computeOptOutRate, runAnalyticsSkill } from './analytics';
import { getAgentCard, isA2AAgentId, listAgentIds } from './cards';

describe('computeOptOutRate', () => {
  it('returns 0 when the book is empty', () => {
    expect(computeOptOutRate(0, 0)).toBe(0);
  });

  it('rounds aggregates and never includes message bodies', () => {
    expect(computeOptOutRate(1000, 13)).toBe(0.013);
  });
});

describe('runAnalyticsSkill', () => {
  it('rejects unknown skills', async () => {
    await expect(
      runAnalyticsSkill({} as never, 'acct', 'dump_messages', {}),
    ).rejects.toThrow('Unknown analytics skill');
  });
});

describe('A2A cards', () => {
  it('lists the five-agent mesh', () => {
    expect(listAgentIds()).toEqual([
      'compliance',
      'qualifier',
      'content',
      'booking',
      'analytics',
    ]);
    expect(isA2AAgentId('content')).toBe(true);
    expect(isA2AAgentId('booking')).toBe(true);
    expect(isA2AAgentId('analytics')).toBe(true);
    expect(isA2AAgentId('concierge')).toBe(false);
  });

  it('publishes P1 skills on Content, Booking, and Analytics cards', () => {
    const origin = 'https://crm.example.com';
    const content = getAgentCard('content', origin);
    expect(content.skills.map((s) => s.id)).toEqual([
      'draft_whatsapp_template',
      'draft_email',
      'draft_landing_hero',
      'calendar_item',
    ]);
    expect(content.capabilities.streaming).toBe(false);
    expect(getAgentCard('booking', origin).skills.map((s) => s.id)).toEqual([
      'offer_slots',
      'confirm_consult',
      'cancel_consult',
      'handoff_human',
    ]);
    expect(getAgentCard('analytics', origin).skills.map((s) => s.id)).toEqual([
      'campaign_funnel',
      'agent_task_stats',
      'opt_out_rate',
    ]);
  });
});
