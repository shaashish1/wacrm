const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Persist only an email WhatsApp actually provided. Never invent one. */
export function extractProvidedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}
