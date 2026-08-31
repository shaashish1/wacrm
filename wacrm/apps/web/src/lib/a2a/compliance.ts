import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMarketingEligibleIds } from '@/lib/consent';
import { copyHasStopFooter, scanPhi } from './phi';

export interface ComplianceInput {
  contactIds?: string[];
  copy?: string;
  contactId?: string;
}

export interface ComplianceArtifact {
  allow: boolean;
  blocked_contact_ids: string[];
  eligible_count: number;
  ineligible_count: number;
  violations: string[];
}

export async function runComplianceSkill(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  input: ComplianceInput,
): Promise<ComplianceArtifact> {
  if (skill === 'review_copy') {
    return reviewCopy(input.copy ?? '');
  }
  if (skill === 'enforce_opt_out') {
    const ids = input.contactId ? [input.contactId] : input.contactIds ?? [];
    return preflightAudience(db, accountId, ids, input.copy);
  }
  if (skill === 'preflight_audience' || !skill) {
    return preflightAudience(db, accountId, input.contactIds ?? [], input.copy);
  }
  throw new Error(`Unknown compliance skill: ${skill}`);
}

export function reviewCopy(copy: string): ComplianceArtifact {
  const violations = scanPhi(copy);
  if (copy.trim() && !copyHasStopFooter(copy)) {
    violations.push('missing_stop_footer');
  }
  return {
    allow: violations.filter((v) => v !== 'missing_stop_footer').length === 0,
    blocked_contact_ids: [],
    eligible_count: 0,
    ineligible_count: 0,
    violations,
  };
}

export async function preflightAudience(
  db: SupabaseClient,
  accountId: string,
  contactIds: string[],
  copy?: string,
): Promise<ComplianceArtifact> {
  const unique = [...new Set(contactIds.filter(Boolean))];
  const eligible = await loadMarketingEligibleIds(db, accountId, unique, 'whatsapp');
  const blocked = unique.filter((id) => !eligible.has(id));
  const copyResult = copy ? reviewCopy(copy) : { violations: [] as string[], allow: true };
  const phiBlock = copyResult.violations.filter((v) => v !== 'missing_stop_footer');
  const allow =
    unique.length > 0 && blocked.length === 0 && phiBlock.length === 0;
  const violations = [...copyResult.violations];
  if (unique.length === 0) violations.push('empty_audience');
  if (blocked.length > 0) violations.push('no_consent_or_opted_out');
  return {
    allow,
    blocked_contact_ids: blocked,
    eligible_count: eligible.size,
    ineligible_count: blocked.length,
    violations,
  };
}
