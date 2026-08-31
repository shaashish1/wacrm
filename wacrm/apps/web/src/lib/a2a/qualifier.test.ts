import { describe, expect, it } from 'vitest';
import { qualifyByRules } from './qualifier';

describe('qualifyByRules', () => {
  it('scores a consult ask without inventing clinical detail', () => {
    const result = qualifyByRules('Can I book a consult Tuesday?', {
      consentOk: true,
    });
    expect(result.service_interest).toBe('wellness_consult');
    expect(result.escalate).toBe(false);
    expect(result.score).toBeGreaterThan(50);
  });

  it('escalates and drops interest when PHI is volunteered', () => {
    const result = qualifyByRules('My MRI shows a tumor, what now?', {
      consentOk: true,
    });
    expect(result.escalate).toBe(true);
    expect(result.service_interest).toBeNull();
    expect(result.reason_code).toBe('phi_escalate');
  });
});
