import { describe, it, expect } from 'vitest';
import { sortNodes } from '../sort-nodes';
import type { NetworkNode } from '../types';

function node(name: string, meta: Partial<NetworkNode['meta']> = {}): NetworkNode {
  return {
    id: name,
    entityId: name,
    kind: 'external_partner',
    gravity: 'outer_orbit',
    identity: { name, avatarUrl: null, label: 'DJ', entityType: 'person' },
    meta: { ...meta },
  } as NetworkNode;
}

const names = (nodes: NetworkNode[]) => nodes.map((n) => n.identity.name);

describe('sortNodes', () => {
  it('sorts by name when asked', () => {
    const out = sortNodes([node('Carol'), node('alice'), node('Bob')], 'name');
    expect(names(out)).toEqual(['alice', 'Bob', 'Carol']);
  });

  it('puts the most recently worked with first', () => {
    const out = sortNodes([
      node('Old', { lastWorked: '2025-01-01' }),
      node('Newest', { lastWorked: '2026-08-16' }),
      node('Middle', { lastWorked: '2026-03-01' }),
    ], 'recent');
    expect(names(out)).toEqual(['Newest', 'Middle', 'Old']);
  });

  // Someone never worked with is not the same as someone last worked with in
  // 2019, and burying real history under records that have none would be worse
  // than either ordering alone.
  it('puts entities with no history after those that have some', () => {
    const out = sortNodes([
      node('Never'),
      node('Ancient', { lastWorked: '2019-01-01' }),
    ], 'recent');
    expect(names(out)).toEqual(['Ancient', 'Never']);
  });

  it('puts the soonest booking first, and the unbooked last', () => {
    const out = sortNodes([
      node('Later', { nextBooked: '2026-12-01' }),
      node('Free'),
      node('Soon', { nextBooked: '2026-09-12' }),
    ], 'upcoming');
    expect(names(out)).toEqual(['Soon', 'Later', 'Free']);
  });

  // Without this, a section where nothing has a date renders in whatever order
  // the server happened to merge it -- which is what made vendors look like two
  // alphabetical runs stuck together.
  it('falls back to name so an undated section still reads as sorted', () => {
    const out = sortNodes([node('Carol'), node('Alice'), node('Bob')], 'recent');
    expect(names(out)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('breaks a date tie by name', () => {
    const out = sortNodes([
      node('Bob', { lastWorked: '2026-08-16' }),
      node('Alice', { lastWorked: '2026-08-16' }),
    ], 'recent');
    expect(names(out)).toEqual(['Alice', 'Bob']);
  });

  it('does not mutate what it was given', () => {
    const input = [node('Carol'), node('Alice')];
    sortNodes(input, 'name');
    expect(names(input)).toEqual(['Carol', 'Alice']);
  });
});
