import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { draftByRules, forbiddenTopicHits, runContentSkill } from './content';
import { reviewCopy } from './compliance';

describe('draftByRules', () => {
  it('never marks drafts as auto-send and includes STOP on WhatsApp', () => {
    const result = draftByRules('draft_whatsapp_template', 'wellness week tour');
    expect(result.auto_send).toBe(false);
    expect(result.draft.toLowerCase()).toContain('stop');
    expect(result.source).toBe('rules');
    const scanned = reviewCopy(result.draft);
    expect(scanned.violations.filter((v) => v !== 'missing_stop_footer')).toEqual([]);
  });

  it('keeps email drafts generic with unsubscribe language', () => {
    const result = draftByRules('draft_email', 'intro consult');
    expect(result.auto_send).toBe(false);
    expect(result.subject).toBeTruthy();
    expect(result.draft.toLowerCase()).toMatch(/unsubscribe|stop/);
  });
});

describe('forbiddenTopicHits', () => {
  it('flags operator-supplied forbidden terms without treating them as stored PHI', () => {
    expect(forbiddenTopicHits('ask about chemo protocol', ['chemo'])).toEqual([
      'forbidden_topic:chemo',
    ]);
    expect(forbiddenTopicHits('intro consult Tuesday', ['chemo'])).toEqual([]);
  });
});

describe('runContentSkill', () => {
  it('refuses PHI briefs and never auto-sends', async () => {
    const result = await runContentSkill(
      {} as SupabaseClient,
      'acct',
      'draft_whatsapp_template',
      { brief: 'Your lab results are ready' },
    );
    expect(result.draft).toBe('');
    expect(result.auto_send).toBe(false);
    expect(result.violations).toContain('diagnosis');
    expect(result.compliance.allow).toBe(false);
  });
});
