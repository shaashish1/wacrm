import { describe, expect, it } from 'vitest';
import { copyHasStopFooter, hasPhi, scanPhi } from './phi';

describe('scanPhi', () => {
  it('flags SSN and clinical terms', () => {
    expect(scanPhi('SSN 123-45-6789')).toContain('ssn');
    expect(scanPhi('your MRI results are ready')).toContain('diagnosis');
  });

  it('allows generic consult copy', () => {
    expect(hasPhi('We have an opening Tue 10:00 for a consult. Reply STOP')).toBe(
      false,
    );
  });
});

describe('copyHasStopFooter', () => {
  it('requires STOP or unsubscribe language', () => {
    expect(copyHasStopFooter('Reply STOP to opt out.')).toBe(true);
    expect(copyHasStopFooter('Wellness week starts Monday')).toBe(false);
  });
});
