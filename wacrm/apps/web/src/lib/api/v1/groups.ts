// ============================================================
// Serializers for public-API WhatsApp groups and CRM contact groups.
// ============================================================

export interface ApiWaGroup {
  id: string;
  jid: string;
  subject: string | null;
  description: string | null;
  size: number;
  is_community: boolean;
  announce: boolean;
  restrict: boolean;
  synced_at: string | null;
}

export interface ApiWaParticipant {
  id: string;
  group_id: string;
  jid: string;
  phone: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  in_crm: boolean;
}

export interface ApiContactGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_smart: boolean;
  smart_filter: unknown;
  member_count: number;
  created_at: string;
  updated_at: string | null;
}

export function serializeWaGroup(row: Record<string, unknown>): ApiWaGroup {
  return {
    id: row.id as string,
    jid: row.jid as string,
    subject: (row.subject as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    size: typeof row.size === 'number' ? row.size : 0,
    is_community: Boolean(row.is_community),
    announce: Boolean(row.announce),
    restrict: Boolean(row.restrict),
    synced_at: (row.synced_at as string | null) ?? null,
  };
}

export function serializeWaParticipant(
  row: Record<string, unknown>,
  inCrm: boolean
): ApiWaParticipant {
  return {
    id: row.id as string,
    group_id: row.group_id as string,
    jid: row.jid as string,
    phone: (row.phone as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    is_admin: Boolean(row.is_admin),
    is_super_admin: Boolean(row.is_super_admin),
    in_crm: inCrm,
  };
}

export function serializeContactGroup(
  row: Record<string, unknown>,
  memberCount?: number
): ApiContactGroup {
  const embed = row.contact_group_members as
    | Array<{ count?: number }>
    | undefined;
  const counted =
    memberCount ??
    (typeof embed?.[0]?.count === 'number' ? embed[0].count : 0);
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    is_smart: Boolean(row.is_smart),
    smart_filter: row.smart_filter ?? null,
    member_count: counted,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function parseContactIds(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { contact_ids?: unknown }).contact_ids;
  if (!Array.isArray(raw)) return null;
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}
