export const A2A_PROTOCOL_VERSION = '0.3.0';

export type A2AAgentId = 'compliance' | 'qualifier';

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
}

export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  version: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities: { streaming: boolean; pushNotifications: boolean };
  skills: A2ASkill[];
}

const SKILLS: Record<A2AAgentId, A2ASkill[]> = {
  compliance: [
    {
      id: 'preflight_audience',
      name: 'Preflight audience',
      description:
        'Return allow + drop list for marketing WhatsApp. Hard-blocks opted_out and missing consent.',
    },
    {
      id: 'review_copy',
      name: 'Review copy',
      description:
        'Scan draft for PHI deny-list hits and a STOP footer. Does not persist clinical text.',
    },
    {
      id: 'enforce_opt_out',
      name: 'Enforce opt-out',
      description: 'Confirm a contact may not receive marketing on WhatsApp.',
    },
  ],
  qualifier: [
    {
      id: 'qualify_inbound',
      name: 'Qualify inbound',
      description:
        'Classify a redacted inbound as service interest + escalate. No symptom dump.',
    },
    {
      id: 'score_lead',
      name: 'Score lead',
      description: 'Return a 0–100 score and reason_code from tags and consent.',
    },
    {
      id: 'detect_phi_leak',
      name: 'Detect PHI leak',
      description: 'Flag inbound text that must not be stored or relayed on WhatsApp.',
    },
  ],
};

const META: Record<A2AAgentId, { name: string; description: string }> = {
  compliance: {
    name: 'Broadcast Compliance',
    description:
      'Hard gate for Doral marketing WhatsApp. Consent, opt-out, PHI deny-list, STOP footer.',
  },
  qualifier: {
    name: 'Lead Qualifier',
    description:
      'Narrow specialist: service interest, locale, urgency, escalate. Never persist PHI.',
  },
};

export function isA2AAgentId(value: string): value is A2AAgentId {
  return value === 'compliance' || value === 'qualifier';
}

export function getAgentCard(agentId: A2AAgentId, origin: string): A2AAgentCard {
  const meta = META[agentId];
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: meta.name,
    description: meta.description,
    url: `${origin.replace(/\/$/, '')}/api/a2a`,
    version: '1.0.0',
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    capabilities: { streaming: false, pushNotifications: false },
    skills: SKILLS[agentId],
  };
}

export function listAgentIds(): A2AAgentId[] {
  return ['compliance', 'qualifier'];
}
