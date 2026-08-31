import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPhi, scanPhi } from './phi';

export type BookingKind = 'consult' | 'intro' | 'tour';

export interface BookingInput {
  contactId?: string;
  appointmentId?: string;
  slotStart?: string;
  slotEnd?: string;
  kind?: string;
  text?: string;
  now?: string;
}

export interface BookingSlot {
  index: number;
  start: string;
  end: string;
  kind: BookingKind;
  label: string;
}

export interface BookingArtifact {
  slots: BookingSlot[];
  appointment_id: string | null;
  status: 'offered' | 'requested' | 'confirmed' | 'canceled' | 'handoff';
  kind: BookingKind;
  escalate: boolean;
  reason_code: string;
  copy: string;
  phi_codes: string[];
}

const SLOT_HOURS = [10, 14, 16];
const SLOT_MINUTES = 30;
const CONFIRM_COPY =
  'We have an opening for a consult. Reply 1, 2, or 3 — or STOP.';

export async function runBookingSkill(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  input: BookingInput,
): Promise<BookingArtifact> {
  const text = typeof input.text === 'string' ? input.text : '';
  const phi = scanPhi(text);
  if (phi.length > 0) {
    return handoffArtifact('phi_escalate', phi);
  }

  if (skill === 'handoff_human') {
    return handoffArtifact('human_requested', []);
  }

  if (skill === 'offer_slots' || !skill) {
    const now = input.now ? new Date(input.now) : new Date();
    const slots = offerConsultSlots(now);
    return {
      slots,
      appointment_id: null,
      status: 'offered',
      kind: 'consult',
      escalate: false,
      reason_code: 'slots_offered',
      copy: CONFIRM_COPY,
      phi_codes: [],
    };
  }

  if (skill === 'confirm_consult') {
    return confirmConsult(db, accountId, input);
  }

  if (skill === 'cancel_consult') {
    return cancelConsult(db, accountId, input);
  }

  throw new Error(`Unknown booking skill: ${skill}`);
}

export function offerConsultSlots(now: Date, count = 3): BookingSlot[] {
  const slots: BookingSlot[] = [];
  const cursor = startOfUtcDay(now);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  let hourIdx = 0;
  let guard = 0;
  while (slots.length < count && guard < 28) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const hour = SLOT_HOURS[hourIdx % SLOT_HOURS.length];
      const start = new Date(cursor);
      start.setUTCHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      const kinds: BookingKind[] = ['consult', 'intro', 'tour'];
      const kind = kinds[slots.length % kinds.length];
      slots.push({
        index: slots.length + 1,
        start: start.toISOString(),
        end: end.toISOString(),
        kind,
        label: `${kind} ${formatSlot(start)}`,
      });
      hourIdx += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return slots;
}

async function confirmConsult(
  db: SupabaseClient,
  accountId: string,
  input: BookingInput,
): Promise<BookingArtifact> {
  const contactId = typeof input.contactId === 'string' ? input.contactId : '';
  if (!contactId) {
    return {
      ...emptyOffered(),
      status: 'handoff',
      escalate: true,
      reason_code: 'missing_contact',
      copy: 'A teammate will follow up to book a consult.',
    };
  }

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!contact) {
    throw new Error('Contact not found');
  }

  const now = input.now ? new Date(input.now) : new Date();
  const slots = offerConsultSlots(now);
  let start = input.slotStart;
  let end = input.slotEnd;
  if (!start) {
    start = slots[0]?.start;
    end = slots[0]?.end;
  }
  if (!start || !end) {
    throw new Error('No consult slot available');
  }
  if (hasPhi(start) || hasPhi(end)) {
    return handoffArtifact('phi_escalate', scanPhi(`${start} ${end}`));
  }

  const kind = parseKind(input.kind);
  const { data, error } = await db
    .from('appointments')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      kind,
      slot_start: start,
      slot_end: end,
      status: 'confirmed',
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(error?.message || 'Failed to confirm consult');
  }

  return {
    slots: [],
    appointment_id: data.id as string,
    status: 'confirmed',
    kind,
    escalate: false,
    reason_code: 'confirmed',
    copy: 'Consult request saved. We will confirm the time — this channel is not for clinical results.',
    phi_codes: [],
  };
}

async function cancelConsult(
  db: SupabaseClient,
  accountId: string,
  input: BookingInput,
): Promise<BookingArtifact> {
  const appointmentId =
    typeof input.appointmentId === 'string' ? input.appointmentId : '';
  if (!appointmentId) {
    throw new Error('appointmentId is required');
  }

  const { data, error } = await db
    .from('appointments')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('account_id', accountId)
    .in('status', ['requested', 'confirmed'])
    .select('id, kind')
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Appointment not found or not cancelable');
  }

  return {
    slots: [],
    appointment_id: data.id as string,
    status: 'canceled',
    kind: parseKind(data.kind),
    escalate: false,
    reason_code: 'canceled',
    copy: 'Consult canceled. Reply if you want a new intro time, or STOP.',
    phi_codes: [],
  };
}

function handoffArtifact(reason: string, phi: string[]): BookingArtifact {
  return {
    slots: [],
    appointment_id: null,
    status: 'handoff',
    kind: 'consult',
    escalate: true,
    reason_code: reason,
    copy: 'Please call the office or use the patient portal for clinical questions.',
    phi_codes: phi,
  };
}

function emptyOffered(): BookingArtifact {
  return {
    slots: [],
    appointment_id: null,
    status: 'offered',
    kind: 'consult',
    escalate: false,
    reason_code: 'slots_offered',
    copy: CONFIRM_COPY,
    phi_codes: [],
  };
}

function parseKind(value: unknown): BookingKind {
  if (value === 'intro' || value === 'tour' || value === 'consult') return value;
  return 'consult';
}

function startOfUtcDay(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatSlot(start: Date): string {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][start.getUTCDay()];
  const hh = String(start.getUTCHours()).padStart(2, '0');
  return `${weekday} ${hh}:00 UTC`;
}
