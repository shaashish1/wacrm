// ============================================================
// Public-API pipeline / deal serializers and input parsers.
// ============================================================

export const PIPELINE_SELECT = 'id, name, created_at';
export const STAGE_SELECT = 'id, pipeline_id, name, position, color, created_at';
export const DEAL_SELECT =
  'id, pipeline_id, stage_id, contact_id, conversation_id, assigned_to, title, value, currency, notes, expected_close_date, status, created_at, updated_at';

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export interface ApiPipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
}

export interface ApiPipeline {
  id: string;
  name: string;
  stage_count: number;
  created_at: string;
  stages?: ApiPipelineStage[];
}

export interface ApiDeal {
  id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  assigned_to: string | null;
  title: string;
  value: number;
  currency: string;
  notes: string | null;
  expected_close_date: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export function serializePipelineStage(
  row: Record<string, unknown>
): ApiPipelineStage {
  return {
    id: row.id as string,
    pipeline_id: row.pipeline_id as string,
    name: row.name as string,
    position: typeof row.position === 'number' ? row.position : 0,
    color: (row.color as string) ?? '#3b82f6',
  };
}

export function serializePipeline(
  row: Record<string, unknown>,
  opts?: { includeStages?: boolean; stageCount?: number }
): ApiPipeline {
  const stagesRaw = row.pipeline_stages as Array<Record<string, unknown>> | undefined;
  const stages = (stagesRaw ?? [])
    .slice()
    .sort(
      (a, b) =>
        (typeof a.position === 'number' ? a.position : 0) -
        (typeof b.position === 'number' ? b.position : 0)
    )
    .map(serializePipelineStage);
  const out: ApiPipeline = {
    id: row.id as string,
    name: row.name as string,
    stage_count: opts?.stageCount ?? stages.length,
    created_at: row.created_at as string,
  };
  if (opts?.includeStages) out.stages = stages;
  return out;
}

export function serializeDeal(row: Record<string, unknown>): ApiDeal {
  const valueRaw = row.value;
  const value =
    typeof valueRaw === 'number'
      ? valueRaw
      : typeof valueRaw === 'string'
        ? Number(valueRaw)
        : 0;
  return {
    id: row.id as string,
    pipeline_id: row.pipeline_id as string,
    stage_id: row.stage_id as string,
    contact_id: (row.contact_id as string | null) ?? null,
    conversation_id: (row.conversation_id as string | null) ?? null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    title: row.title as string,
    value: Number.isFinite(value) ? value : 0,
    currency: (row.currency as string) || 'USD',
    notes: (row.notes as string | null) ?? null,
    expected_close_date: (row.expected_close_date as string | null) ?? null,
    status: (row.status as string) || 'open',
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function parseDealStatus(value: unknown): DealStatus | null {
  if (typeof value !== 'string') return null;
  return (DEAL_STATUSES as readonly string[]).includes(value)
    ? (value as DealStatus)
    : null;
}

export interface ParsedStageInput {
  name: string;
  position: number;
  color: string;
}

export function parseStagesInput(raw: unknown): ParsedStageInput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: ParsedStageInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== 'object') return null;
    const name =
      typeof (s as { name?: unknown }).name === 'string'
        ? (s as { name: string }).name.trim()
        : '';
    if (!name) return null;
    const positionRaw = (s as { position?: unknown }).position;
    const position =
      typeof positionRaw === 'number' && Number.isFinite(positionRaw)
        ? positionRaw
        : i;
    const color =
      typeof (s as { color?: unknown }).color === 'string'
        ? (s as { color: string }).color
        : '#3b82f6';
    out.push({ name, position, color });
  }
  return out;
}
