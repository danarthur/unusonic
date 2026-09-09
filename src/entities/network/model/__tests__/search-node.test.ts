import { describe, it, expect } from 'vitest';
import { matchesQuery, filterNodes } from '../search-node';
import type { NetworkNode } from '../types';

function node(over: Partial<NetworkNode> = {}, meta: Partial<NetworkNode['meta']> = {}): NetworkNode {
  return {
    id: 'edge-1',
    entityId: 'ent-1',
    kind: 'external_partner',
    gravity: 'outer_orbit',
    identity: { name: 'Brandi Jane', avatarUrl: null, label: 'Wedding planner', entityType: 'person' },
    meta: { ...meta },
    ...over,
  } as NetworkNode;
}

describe('matchesQuery', () => {
  it('matches everything on an empty query', () => {
    expect(matchesQuery(node(), '')).toBe(true);
    expect(matchesQuery(node(), '   ')).toBe(true);
  });

  it('matches a name, case-insensitively and part-way through', () => {
    expect(matchesQuery(node(), 'brandi')).toBe(true);
    expect(matchesQuery(node(), 'BRAND')).toBe(true);
    expect(matchesQuery(node(), 'jane')).toBe(true);
  });

  // Every word has to appear, but the order they were typed in does not.
  it('matches words in any order', () => {
    expect(matchesQuery(node(), 'jane brandi')).toBe(true);
    expect(matchesQuery(node(), 'brandi planner')).toBe(true);
  });

  it('does not match when one of the words is absent', () => {
    expect(matchesQuery(node(), 'brandi photographer')).toBe(false);
  });

  it('matches what they do', () => {
    expect(matchesQuery(node(), 'planner')).toBe(true);
  });

  // "The planner at Pure Lavish" is a search for Pure Lavish that has to
  // return a person.
  it('matches the company someone works for', () => {
    const n = node({ employer: { entityId: 'c1', name: 'Pure Lavish' } });
    expect(matchesQuery(n, 'pure lavish')).toBe(true);
  });

  it('matches the people named on a company', () => {
    const n = node(
      {
        identity: { name: 'Brandi Jane Events', avatarUrl: null, label: 'Partner', entityType: 'company' },
        affiliates: [{ entityId: 'p1', name: 'Alexa Infranca', jobTitle: 'Coordinator' }],
      },
    );
    expect(matchesQuery(n, 'alexa')).toBe(true);
    expect(matchesQuery(n, 'coordinator')).toBe(true);
  });

  it('matches email, tags, capabilities and region', () => {
    const n = node({ crewRoles: ['dj'] }, {
      email: 'brandi@ivoryandoak.com',
      tags: ['preferred'],
      capabilities: ['photo booth'],
      region: 'Napa, CA',
    });
    expect(matchesQuery(n, 'ivoryandoak')).toBe(true);
    expect(matchesQuery(n, 'preferred')).toBe(true);
    expect(matchesQuery(n, 'photo')).toBe(true);
    expect(matchesQuery(n, 'napa')).toBe(true);
    expect(matchesQuery(n, 'dj')).toBe(true);
  });

  describe('phone numbers', () => {
    const n = node({}, { phone: '(555) 123-4567' });

    // The separators typed are never the separators stored.
    it('ignores the punctuation on both sides', () => {
      expect(matchesQuery(n, '5551234567')).toBe(true);
      expect(matchesQuery(n, '555-123')).toBe(true);
      expect(matchesQuery(n, '4567')).toBe(true);
    });

    it('does not match a number that is not theirs', () => {
      expect(matchesQuery(n, '9999')).toBe(false);
    });

    // Two digits is more likely part of a name or a year than a phone search.
    it('ignores a fragment too short to be a phone number', () => {
      expect(matchesQuery(node({}, { phone: '5551234567' }), '55')).toBe(false);
    });
  });
});

describe('filterNodes', () => {
  it('returns everything for an empty query, without copying needlessly', () => {
    const nodes = [node(), node()];
    expect(filterNodes(nodes, '')).toBe(nodes);
  });

  it('keeps the order it was given', () => {
    const nodes = [
      node({ id: 'a', identity: { name: 'Anna', avatarUrl: null, label: 'DJ', entityType: 'person' } }),
      node({ id: 'b', identity: { name: 'Bob', avatarUrl: null, label: 'DJ', entityType: 'person' } }),
    ];
    expect(filterNodes(nodes, 'dj').map((n) => n.id)).toEqual(['a', 'b']);
  });
});
