/**
 * Opt-out keywords. Whole-message match or first whitespace-separated
 * token, case-insensitive. Used by the inbound webhook and the worker
 * so STOP/UNSUBSCRIBE is honored even if one path is skipped.
 */
const OPT_OUT_TOKENS = new Set([
  'stop',
  'unsubscribe',
  'end',
  'quit',
  'cancel',
]);

export function isOptOutText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (OPT_OUT_TOKENS.has(lower)) return true;
  const first = lower.split(/\s+/)[0];
  return OPT_OUT_TOKENS.has(first);
}
