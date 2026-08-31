import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { hasPhi, scanPhi } from './phi';

export interface QualifierInput {
  text?: string;
  tags?: string[];
  consentOk?: boolean;
  locale?: string;
}

export interface QualifierArtifact {
  service_interest: string | null;
  locale: string;
  urgency: 'low' | 'medium' | 'high';
  score: number;
  escalate: boolean;
  reason_code: string;
  phi_codes: string[];
}

const INTEREST: { id: string; re: RegExp }[] = [
  { id: 'wellness_consult', re: /\b(consult|appointment|book|visit|intro)\b/i },
  { id: 'nutrition', re: /\b(nutrition|diet|weight)\b/i },
  { id: 'membership_tour', re: /\b(membership|tour|hours|location|parking)\b/i },
];

export async function runQualifierSkill(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  input: QualifierInput,
): Promise<QualifierArtifact> {
  const text = typeof input.text === 'string' ? input.text : '';
  const phi = scanPhi(text);
  if (skill === 'detect_phi_leak') {
    return {
      service_interest: null,
      locale: input.locale || 'en',
      urgency: 'low',
      score: 0,
      escalate: phi.length > 0,
      reason_code: phi.length > 0 ? 'phi_detected' : 'clean',
      phi_codes: phi,
    };
  }

  const rules = qualifyByRules(text, input);
  if (phi.length > 0) {
    return {
      ...rules,
      escalate: true,
      reason_code: 'phi_escalate',
      phi_codes: phi,
      service_interest: null,
    };
  }

  if (skill === 'score_lead') {
    return rules;
  }

  if (skill === 'qualify_inbound' || !skill) {
    const withLlm = await maybeLlmQualify(db, accountId, text, rules);
    return withLlm;
  }

  throw new Error(`Unknown qualifier skill: ${skill}`);
}

export function qualifyByRules(text: string, input: QualifierInput): QualifierArtifact {
  const phi = scanPhi(text);
  if (phi.length > 0) {
    return {
      service_interest: null,
      locale: input.locale || 'en',
      urgency: 'high',
      score: 0,
      escalate: true,
      reason_code: 'phi_escalate',
      phi_codes: phi,
    };
  }

  let interest: string | null = null;
  for (const row of INTEREST) {
    if (row.re.test(text)) {
      interest = row.id;
      break;
    }
  }

  const consentOk = input.consentOk !== false;
  const urgent = /\b(today|asap|urgent|now)\b/i.test(text);
  const score = Math.min(
    100,
    (interest ? 40 : 10) + (consentOk ? 30 : 0) + (urgent ? 20 : 0) + (text.trim() ? 10 : 0),
  );

  return {
    service_interest: interest,
    locale: input.locale || 'en',
    urgency: urgent ? 'high' : interest ? 'medium' : 'low',
    score,
    escalate: !consentOk,
    reason_code: !consentOk ? 'no_consent' : interest ? 'qualified' : 'needs_human',
    phi_codes: [],
  };
}

async function maybeLlmQualify(
  db: SupabaseClient,
  accountId: string,
  text: string,
  fallback: QualifierArtifact,
): Promise<QualifierArtifact> {
  if (!text.trim() || hasPhi(text)) return fallback;
  let config;
  try {
    config = await loadAiConfig(db, accountId, { requireActive: false });
  } catch {
    return fallback;
  }
  if (!config) return fallback;

  try {
    const result = await generateReply({
      config,
      systemPrompt:
        'You classify wellness-marketing leads. Return ONLY JSON: ' +
        '{"service_interest":"wellness_consult|nutrition|membership_tour|null","urgency":"low|medium|high","score":0-100,"escalate":boolean,"reason_code":"string"}. ' +
        'Never repeat diagnoses, meds, labs, or SSN. If the user shares clinical detail, escalate=true and omit that text.',
      messages: [{ role: 'user', content: text.slice(0, 500) }],
    });
    const parsed = extractJson(result.text);
    if (!parsed) return fallback;
    if (hasPhi(JSON.stringify(parsed))) return fallback;
    return {
      service_interest:
        typeof parsed.service_interest === 'string' ? parsed.service_interest : fallback.service_interest,
      locale: fallback.locale,
      urgency:
        parsed.urgency === 'high' || parsed.urgency === 'medium' || parsed.urgency === 'low'
          ? parsed.urgency
          : fallback.urgency,
      score: clampScore(parsed.score, fallback.score),
      escalate: Boolean(parsed.escalate) || fallback.escalate,
      reason_code:
        typeof parsed.reason_code === 'string' ? parsed.reason_code : fallback.reason_code,
      phi_codes: [],
    };
  } catch {
    return fallback;
  }
}

function clampScore(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
