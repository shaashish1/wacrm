export const A2A_PROTOCOL_VERSION = '0.3.0';

export type A2AAgentId =
  | 'compliance'
  | 'qualifier'
  | 'content'
  | 'booking'
  | 'analytics';

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
  content: [
    {
      id: 'draft_whatsapp_template',
      name: 'Draft WhatsApp template',
      description:
        'Draft generic consult/tour copy with a STOP footer. Never auto-sends. Compliance-reviewed.',
    },
    {
      id: 'draft_email',
      name: 'Draft email',
      description:
        'Draft a marketing email with unsubscribe language. Never auto-sends.',
    },
    {
      id: 'draft_landing_hero',
      name: 'Draft landing hero',
      description: 'Draft a landing headline + body. No clinical claims.',
    },
    {
      id: 'calendar_item',
      name: 'Calendar item',
      description:
        'Suggest a planned send item (copy only). Does not schedule or send.',
    },
  ],
  booking: [
    {
      id: 'offer_slots',
      name: 'Offer slots',
      description:
        'Offer three generic consult/intro/tour times. No reason-for-visit field.',
    },
    {
      id: 'confirm_consult',
      name: 'Confirm consult',
      description:
        'Persist a generic consult request. Refuses clinical free text.',
    },
    {
      id: 'cancel_consult',
      name: 'Cancel consult',
      description: 'Cancel a previously confirmed generic consult.',
    },
    {
      id: 'handoff_human',
      name: 'Handoff human',
      description:
        'Escalate to a human. Does not persist volunteered clinical text.',
    },
  ],
  analytics: [
    {
      id: 'campaign_funnel',
      name: 'Campaign funnel',
      description:
        'Aggregate landing / consent / send counts. No message bodies in artifacts.',
    },
    {
      id: 'agent_task_stats',
      name: 'Agent task stats',
      description: 'Count A2A tasks by agent and state. Aggregates only.',
    },
    {
      id: 'opt_out_rate',
      name: 'Opt-out rate',
      description: 'Contacts opted out vs book size and active WhatsApp consents.',
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
  content: {
    name: 'Content',
    description:
      'Drafts marketing copy. Never auto-sends. Output is scanned by Compliance rules.',
  },
  booking: {
    name: 'Booking / Receptionist',
    description:
      'Generic consult/intro/tour slots only. No clinical reason codes. WhatsApp is not HIPAA.',
  },
  analytics: {
    name: 'Analytics',
    description:
      'Funnel and task aggregates only. Never returns message bodies or PHI.',
  },
};

const AGENT_IDS: A2AAgentId[] = [
  'compliance',
  'qualifier',
  'content',
  'booking',
  'analytics',
];

export function isA2AAgentId(value: string): value is A2AAgentId {
  return (AGENT_IDS as string[]).includes(value);
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
  return [...AGENT_IDS];
}
