import { describe, expect, it } from 'vitest';
import { extractProvidedEmail } from './email';

describe('extractProvidedEmail', () => {
  it('accepts a real email and rejects invented or empty values', () => {
    expect(extractProvidedEmail('maya@clinic.example')).toBe('maya@clinic.example');
    expect(extractProvidedEmail('  ')).toBeNull();
    expect(extractProvidedEmail('not-an-email')).toBeNull();
    expect(extractProvidedEmail(undefined)).toBeNull();
  });
});
