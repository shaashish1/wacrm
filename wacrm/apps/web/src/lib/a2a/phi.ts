/**
 * Marketing-CRM deny-list. WhatsApp is not a HIPAA channel — refuse
 * copy and artifacts that look like clinical or identity data.
 * Do not persist matches; only return codes.
 */

const PATTERNS: { code: string; re: RegExp }[] = [
  { code: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { code: 'ssn_label', re: /\b(ssn|social security)\b/i },
  { code: 'mrn', re: /\b(mrn|medical record( number)?|chart number)\b/i },
  { code: 'insurance', re: /\b(insurance (id|member)|member id|policy number)\b/i },
  { code: 'license', re: /\b(driver'?s license|dl number)\b/i },
  { code: 'diagnosis', re: /\b(diagnos(is|ed)|medication|prescription|rx\b|lab results?|imaging|mri|x-?ray|blood test|hiv|cancer|tumor)\b/i },
  { code: 'symptoms_prompt', re: /\b(tell us your symptoms|describe your (pain|symptoms)|what'?s your diagnosis)\b/i },
];

export function scanPhi(text: string | null | undefined): string[] {
  if (!text || !text.trim()) return [];
  const hits: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(text)) hits.push(p.code);
  }
  return [...new Set(hits)];
}

export function hasPhi(text: string | null | undefined): boolean {
  return scanPhi(text).length > 0;
}

export function copyHasStopFooter(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(stop|unsubscribe|opt[ -]?out)\b/i.test(text);
}
