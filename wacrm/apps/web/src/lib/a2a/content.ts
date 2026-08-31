import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { reviewCopy, type ComplianceArtifact } from './compliance';
import { hasPhi, scanPhi } from './phi';

export interface ContentInput {
  brief?: string;
  channel?: string;
  forbidden?: string[];
}

export interface ContentArtifact {
  draft: string;
  subject: string | null;
  footer: string;
  auto_send: false;
  violations: string[];
  compliance: ComplianceArtifact;
  source: 'rules' | 'llm';
}

const STOP_FOOTER = 'Reply STOP to opt out.';
const EMAIL_UNSUB = 'Unsubscribe by replying STOP or using the link in this email.';

export async function runContentSkill(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  input: ContentInput,
): Promise<ContentArtifact> {
  const known = [
    'draft_whatsapp_template',
    'draft_email',
    'draft_landing_hero',
    'calendar_item',
  ];
  if (skill && !known.includes(skill)) {
    throw new Error(`Unknown content skill: ${skill}`);
  }

  const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
  const forbiddenHits = forbiddenTopicHits(brief, input.forbidden);
  const phi = scanPhi(brief);
  if (phi.length > 0 || forbiddenHits.length > 0) {
    return blockedDraft([...phi, ...forbiddenHits]);
  }

  const rules = draftByRules(skill || 'draft_whatsapp_template', brief);
  const withLlm = await maybeLlmDraft(db, accountId, skill || 'draft_whatsapp_template', brief, rules);
  return attachCompliance(withLlm);
}

export function draftByRules(skill: string, brief: string): ContentArtifact {
  const topic = brief || 'a wellness intro consult';
  const safeTopic = topic.slice(0, 180);
  if (skill === 'draft_email') {
    return {
      draft: `Hello,\n\nYou asked about ${safeTopic}. We have openings this week for an intro consult or tour — no clinical results on this channel.\n\nReply if a weekday morning or afternoon works.\n\n${EMAIL_UNSUB}`,
      subject: 'Intro consult openings this week',
      footer: EMAIL_UNSUB,
      auto_send: false,
      violations: [],
      compliance: emptyCompliance(),
      source: 'rules',
    };
  }
  if (skill === 'draft_landing_hero') {
    return {
      draft: `Book a wellness intro consult. Generic scheduling only — we do not share lab results or diagnoses on WhatsApp.\n\n${STOP_FOOTER}`,
      subject: 'New patient wellness week',
      footer: STOP_FOOTER,
      auto_send: false,
      violations: [],
      compliance: emptyCompliance(),
      source: 'rules',
    };
  }
  if (skill === 'calendar_item') {
    return {
      draft: `Planned WhatsApp drop: intro consult openings. Copy stays generic. ${STOP_FOOTER}`,
      subject: 'Wellness-week WhatsApp',
      footer: STOP_FOOTER,
      auto_send: false,
      violations: [],
      compliance: emptyCompliance(),
      source: 'rules',
    };
  }
  return {
    draft: `Hi — we have an opening this week for an intro consult or tour (${safeTopic}). Reply YES or STOP.\n\n${STOP_FOOTER}`,
    subject: null,
    footer: STOP_FOOTER,
    auto_send: false,
    violations: [],
    compliance: emptyCompliance(),
    source: 'rules',
  };
}

export function forbiddenTopicHits(text: string, forbidden?: string[]): string[] {
  if (!text || !forbidden?.length) return [];
  const hits: string[] = [];
  for (const raw of forbidden) {
    const term = raw.trim();
    if (term.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
    if (re.test(text)) hits.push(`forbidden_topic:${term.toLowerCase()}`);
  }
  return hits;
}

function attachCompliance(artifact: ContentArtifact): ContentArtifact {
  const scanned = reviewCopy(artifact.draft);
  const phiBlock = scanned.violations.filter((v) => v !== 'missing_stop_footer');
  if (phiBlock.length > 0) {
    return blockedDraft(phiBlock);
  }
  return {
    ...artifact,
    auto_send: false,
    violations: scanned.violations,
    compliance: scanned,
  };
}

function blockedDraft(violations: string[]): ContentArtifact {
  return {
    draft: '',
    subject: null,
    footer: STOP_FOOTER,
    auto_send: false,
    violations,
    compliance: {
      allow: false,
      blocked_contact_ids: [],
      eligible_count: 0,
      ineligible_count: 0,
      violations,
    },
    source: 'rules',
  };
}

function emptyCompliance(): ComplianceArtifact {
  return {
    allow: true,
    blocked_contact_ids: [],
    eligible_count: 0,
    ineligible_count: 0,
    violations: [],
  };
}

async function maybeLlmDraft(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  brief: string,
  fallback: ContentArtifact,
): Promise<ContentArtifact> {
  if (!brief || hasPhi(brief)) return fallback;
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
        'You write wellness-clinic marketing copy. Return ONLY JSON: ' +
        '{"draft":"string","subject":"string|null"}. ' +
        'Generic consult/intro/tour language only. Always include STOP or unsubscribe. ' +
        'Never mention diagnoses, meds, labs, SSN, MRN, or insurance. Never claim HIPAA. Do not auto-send.',
      messages: [
        {
          role: 'user',
          content: `Skill: ${skill}. Brief: ${brief.slice(0, 400)}`,
        },
      ],
    });
    const parsed = extractJson(result.text);
    if (!parsed || typeof parsed.draft !== 'string') return fallback;
    const draft = parsed.draft.trim();
    if (!draft || hasPhi(draft) || hasPhi(JSON.stringify(parsed))) return fallback;
    return {
      draft,
      subject: typeof parsed.subject === 'string' ? parsed.subject : fallback.subject,
      footer: fallback.footer,
      auto_send: false,
      violations: [],
      compliance: emptyCompliance(),
      source: 'llm',
    };
  } catch {
    return fallback;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
