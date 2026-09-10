/**
 * Resolving an entity id to the relationship the record page needs.
 *
 * Clicking a partner chip landed on the read-first fallback — the same person
 * with most of their record missing — because the route takes a relationship id
 * and the chip only had an entity one. What matters here: a live partner edge
 * wins, a soft-deleted one is not a landing place, and a roster member resolves
 * through the edge that points the other way.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

/** Queries recorded in order, so the test can assert which table was asked. */
const calls: { schema: string; table: string; filters: Row }[] = [];
let orgEntity: Row | null = { id: 'org-ent' };
let partnerEdges: Row[] = [];
let rosterEdge: Row | null = null;

function builder(schema: string, table: string) {
  const filters: Row = {};
  const record = { schema, table, filters };
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
    in: (col: string, val: unknown) => { filters[col] = val; return chain; },
    limit: () => {
      calls.push(record);
      return Promise.resolve({ data: partnerEdges });
    },
    maybeSingle: () => {
      calls.push(record);
      if (table === 'entities') return Promise.resolve({ data: orgEntity });
      return Promise.resolve({ data: rosterEdge });
    },
  };
  return chain;
}

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: async () => ({
    schema: (schema: string) => ({ from: (table: string) => builder(schema, table) }),
  }),
}));

import { resolveRelationshipId } from '../resolve-relationship-id';

beforeEach(() => {
  calls.length = 0;
  orgEntity = { id: 'org-ent' };
  partnerEdges = [];
  rosterEdge = null;
});

describe('resolveRelationshipId', () => {
  it('finds a live partner edge', async () => {
    partnerEdges = [{ id: 'rel-1', context_data: { tier: 'preferred' } }];

    expect(await resolveRelationshipId('ent-1', 'org-1')).toEqual({
      relationshipId: 'rel-1',
      kind: 'external_partner',
    });
  });

  it('will not land you on a soft-deleted connection', async () => {
    // The row survives a delete so it can be restored for thirty days. Landing
    // on it would show a record the network list has already stopped offering.
    partnerEdges = [{ id: 'rel-gone', context_data: { deleted_at: '2026-09-01T00:00:00Z' } }];

    expect(await resolveRelationshipId('ent-1', 'org-1')).toBeNull();
  });

  it('prefers the live edge when a deleted one sits beside it', async () => {
    partnerEdges = [
      { id: 'rel-gone', context_data: { deleted_at: '2026-09-01T00:00:00Z' } },
      { id: 'rel-live', context_data: {} },
    ];

    expect(await resolveRelationshipId('ent-1', 'org-1')).toEqual({
      relationshipId: 'rel-live',
      kind: 'external_partner',
    });
  });

  it('falls through to the roster edge, which points the other way', async () => {
    rosterEdge = { id: 'rel-roster' };

    expect(await resolveRelationshipId('ent-1', 'org-1')).toEqual({
      relationshipId: 'rel-roster',
      kind: 'internal_employee',
    });
    const roster = calls.find((c) => c.filters.relationship_type === 'ROSTER_MEMBER');
    // Person -> org, the reverse of a partner edge.
    expect(roster?.filters.source_entity_id).toBe('ent-1');
    expect(roster?.filters.target_entity_id).toBe('org-ent');
  });

  it('scopes the lookup to the caller’s own org, not just the workspace', async () => {
    // A workspace can hold more than one org. Matching any edge to the person
    // could hand back another org's relationship.
    partnerEdges = [{ id: 'rel-1', context_data: {} }];
    await resolveRelationshipId('ent-1', 'org-1');

    const partner = calls.find((c) => c.table === 'relationships');
    expect(partner?.filters.source_entity_id).toBe('org-ent');
    expect(partner?.filters.target_entity_id).toBe('ent-1');
  });

  it('gives up quietly when the org has no directory entity', async () => {
    orgEntity = null;
    expect(await resolveRelationshipId('ent-1', 'org-1')).toBeNull();
  });

  it('needs both ids', async () => {
    expect(await resolveRelationshipId('', 'org-1')).toBeNull();
    expect(await resolveRelationshipId('ent-1', '')).toBeNull();
  });
});
