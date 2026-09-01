import { describe, expect, it } from 'vitest';

import { hasScope } from '../../api-keys/scopes';

import {
  parseDealStatus,
  parseStagesInput,
  serializeDeal,
  serializePipeline,
  serializePipelineStage,
} from './pipelines';

describe('pipeline scopes', () => {
  it('pipelines:write is distinct from pipelines:read', () => {
    expect(hasScope(['pipelines:read'], 'pipelines:write')).toBe(false);
    expect(hasScope(['pipelines:write'], 'pipelines:write')).toBe(true);
  });
});

describe('serializePipeline', () => {
  it('sorts stages and omits them on the list shape', () => {
    const row = {
      id: 'p1',
      name: 'Consults',
      created_at: '2026-01-01T00:00:00Z',
      pipeline_stages: [
        { id: 'st2', pipeline_id: 'p1', name: 'Qualified', position: 1, color: '#eab308' },
        { id: 'st1', pipeline_id: 'p1', name: 'New Lead', position: 0, color: '#3b82f6' },
      ],
    };
    expect(serializePipeline(row).stages).toBeUndefined();
    expect(serializePipeline(row).stage_count).toBe(2);
    expect(serializePipeline(row, { includeStages: true }).stages?.map((s) => s.name)).toEqual([
      'New Lead',
      'Qualified',
    ]);
  });
});

describe('serializePipelineStage / serializeDeal', () => {
  it('coerces deal value from numeric strings', () => {
    expect(
      serializeDeal({
        id: 'd1',
        pipeline_id: 'p1',
        stage_id: 'st1',
        contact_id: null,
        title: 'Intro consult',
        value: '150.00',
        currency: 'USD',
        status: 'open',
        created_at: 'a',
        updated_at: 'b',
      })
    ).toMatchObject({
      id: 'd1',
      contact_id: null,
      value: 150,
      currency: 'USD',
      status: 'open',
    });
  });

  it('defaults stage color', () => {
    expect(
      serializePipelineStage({
        id: 'st1',
        pipeline_id: 'p1',
        name: 'New',
        position: 0,
      }).color
    ).toBe('#3b82f6');
  });
});

describe('parseDealStatus', () => {
  it('accepts open/won/lost only', () => {
    expect(parseDealStatus('open')).toBe('open');
    expect(parseDealStatus('won')).toBe('won');
    expect(parseDealStatus('lost')).toBe('lost');
    expect(parseDealStatus('active')).toBeNull();
    expect(parseDealStatus(1)).toBeNull();
  });
});

describe('parseStagesInput', () => {
  it('treats missing stages as empty', () => {
    expect(parseStagesInput(undefined)).toEqual([]);
  });

  it('returns null for a non-array or nameless stage', () => {
    expect(parseStagesInput('x')).toBeNull();
    expect(parseStagesInput([{ name: '' }])).toBeNull();
  });

  it('fills position from index and a default color', () => {
    expect(parseStagesInput([{ name: ' New Lead ' }])).toEqual([
      { name: 'New Lead', position: 0, color: '#3b82f6' },
    ]);
  });
});
