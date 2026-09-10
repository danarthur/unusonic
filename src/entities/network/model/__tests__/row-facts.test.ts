import { describe, it, expect } from 'vitest';
import { rowFactsFor } from '../row-facts';
import type { NetworkNode } from '../types';

function node(entityType: 'person' | 'company' | 'venue'): NetworkNode {
  return {
    id: entityType,
    entityId: entityType,
    kind: 'external_partner',
    gravity: 'outer_orbit',
    identity: { name: 'x', avatarUrl: null, label: '', entityType },
    meta: {},
  } as NetworkNode;
}

describe('rowFactsFor', () => {
  // The dead space this was written to remove: a venue has no rate and never
  // owes us anything.
  it('gives a venue list no rate and no money column', () => {
    expect(rowFactsFor([node('venue'), node('venue')])).toEqual(['lastShow', 'next']);
  });

  it('gives a people list every column', () => {
    expect(rowFactsFor([node('person')])).toEqual(['rate', 'lastShow', 'next', 'money']);
  });

  it('gives a company list money but no rate', () => {
    expect(rowFactsFor([node('company')])).toEqual(['lastShow', 'next', 'money']);
  });

  // The bug this replaces: choosing columns per row meant a mixed section
  // rendered Rate on the people and not on the companies, so the columns moved
  // as the eye went down the list.
  it('uses one column set across a mixed list', () => {
    const mixed = rowFactsFor([node('company'), node('person'), node('venue')]);
    expect(mixed).toEqual(['rate', 'lastShow', 'next', 'money']);
  });

  it('keeps a stable column order however the list is ordered', () => {
    expect(rowFactsFor([node('venue'), node('person')]))
      .toEqual(rowFactsFor([node('person'), node('venue')]));
  });

  it('returns nothing for an empty list', () => {
    expect(rowFactsFor([])).toEqual([]);
  });
});
