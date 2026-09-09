/**
 * Category derivation — membership comes from role edges, never from the star.
 *
 * Regression: zones were derived from `gravity`, so starring someone changed
 * which zone they appeared in, and unstarred clients landed in the same
 * undifferentiated bucket as unstarred freelancers.
 */

import { describe, it, expect } from 'vitest';
import { categoriesOf, isInCategory, isUnsorted, CATEGORY_ORDER } from '../categories';
import type { NetworkNode } from '../types';

function node(over: Partial<NetworkNode>): NetworkNode {
  return {
    id: 'e1',
    entityId: 'ent1',
    kind: 'external_partner',
    gravity: 'outer_orbit',
    identity: { name: 'Someone', avatarUrl: null, label: '' },
    meta: {},
    ...over,
  } as NetworkNode;
}

describe('categoriesOf', () => {
  it('places each role edge in its category', () => {
    expect(categoriesOf(node({ roles: ['CLIENT'] }))).toEqual(['clients']);
    expect(categoriesOf(node({ roles: ['VENDOR'] }))).toEqual(['vendors']);
    expect(categoriesOf(node({ roles: ['VENUE_PARTNER'] }))).toEqual(['venues']);
    expect(categoriesOf(node({ roles: ['ROSTER_MEMBER'] }))).toEqual(['roster']);
    // PARTNER resolves by entity type, so state it: see the dedicated cases below.
    expect(categoriesOf(node({
      roles: ['PARTNER'],
      identity: { name: 'x', avatarUrl: null, label: '', entityType: 'person' },
    }))).toEqual(['roster']);
  });

  it('sends a PARTNER company to vendors, not roster', () => {
    // Regression: PARTNER is a catch-all written by summonPartner for both
    // freelance people and partner companies. Mapping it wholesale to roster
    // put companies like "Pure Lavish Events" in a category defined as people
    // you put on jobs.
    expect(categoriesOf(node({ roles: ['PARTNER'], identity: { name: 'Pure Lavish Events', avatarUrl: null, label: '', entityType: 'company' } })))
      .toEqual(['vendors']);
    expect(categoriesOf(node({ roles: ['PARTNER'], identity: { name: 'A Venue', avatarUrl: null, label: '', entityType: 'venue' } })))
      .toEqual(['vendors']);
  });

  it('keeps a PARTNER person in roster', () => {
    expect(categoriesOf(node({ roles: ['PARTNER'], identity: { name: 'A Freelancer', avatarUrl: null, label: '', entityType: 'person' } })))
      .toEqual(['roster']);
  });

  it('puts a multi-role entity in every category it belongs to', () => {
    // "1909" in the live workspace — a venue that also sub-rents gear.
    expect(categoriesOf(node({ roles: ['VENUE_PARTNER', 'VENDOR'] })))
      .toEqual(['vendors', 'venues']);
    // Alex Barnhart — a client who also carries a partner edge. PARTNER is a
    // catch-all and adds nothing next to a role that already says what he is,
    // so he is a client and NOT also crew. He used to appear in both, which is
    // how people who hire you ended up in your own roster.
    expect(categoriesOf(node({
      roles: ['CLIENT', 'PARTNER'],
      identity: { name: 'Alex Barnhart', avatarUrl: null, label: '', entityType: 'person' },
    }))).toEqual(['clients']);
  });

  it('returns categories in the fixed order regardless of role order', () => {
    const a = categoriesOf(node({ roles: ['VENUE_PARTNER', 'CLIENT', 'VENDOR'] }));
    expect(a).toEqual(['clients', 'vendors', 'venues']);
    expect(CATEGORY_ORDER.indexOf('clients')).toBe(0);
  });

  it('does not let the star change membership', () => {
    // The whole point: gravity is a preference axis and must not affect category.
    const starred = node({ roles: ['CLIENT'], gravity: 'inner_circle' });
    const plain = node({ roles: ['CLIENT'], gravity: 'outer_orbit' });
    expect(categoriesOf(starred)).toEqual(categoriesOf(plain));
  });

  it('treats employees and extended team as roster even with no role edge', () => {
    expect(categoriesOf(node({ kind: 'internal_employee', roles: [] }))).toEqual(['roster']);
    expect(categoriesOf(node({ kind: 'extended_team', roles: [] }))).toEqual(['roster']);
  });

  it('falls back to relationshipType for nodes built before roles existed', () => {
    expect(categoriesOf(node({ relationshipType: 'CLIENT' }))).toEqual(['clients']);
  });

  it('defaults an unknown-type PARTNER to vendors rather than asserting personhood', () => {
    expect(categoriesOf(node({ roles: ['PARTNER'] }))).toEqual(['vendors']);
  });

  it('reports nodes with no recognised role as unsorted, not as a category', () => {
    const orphan = node({ roles: [] });
    expect(categoriesOf(orphan)).toEqual([]);
    expect(isUnsorted(orphan)).toBe(true);
    expect(isUnsorted(node({ roles: ['CLIENT'] }))).toBe(false);
  });

  it('isInCategory matches every category a node holds', () => {
    // Two real roles, so the node is genuinely in both.
    const n = node({ roles: ['CLIENT', 'VENDOR'] });
    expect(isInCategory(n, 'clients')).toBe(true);
    expect(isInCategory(n, 'vendors')).toBe(true);
    expect(isInCategory(n, 'venues')).toBe(false);
    expect(isInCategory(n, 'roster')).toBe(false);
  });

  it('does not put someone who hires us in our own roster', () => {
    // A PARTNER edge next to a CLIENT or VENDOR edge says nothing new -- it is
    // a catch-all written by summonPartner for freelancers and partner
    // companies alike. Treating it as roster is how a coordinator who books you
    // ended up filed as your crew, with a profile offering her a day rate.
    const coordinator = node({
      roles: ['VENDOR', 'PARTNER'],
      identity: { name: 'Brandi Jane', avatarUrl: null, label: 'Planner', entityType: 'person' },
    });
    expect(categoriesOf(coordinator)).toEqual(['vendors']);
    expect(isInCategory(coordinator, 'roster')).toBe(false);
  });

  it('still puts a plain freelancer in the roster', () => {
    // PARTNER alone on a person IS the freelancer pattern summonPersonGhost
    // writes. Nothing about this change should reach them.
    const freelancer = node({
      roles: ['PARTNER'],
      identity: { name: 'Mike Sincere', avatarUrl: null, label: 'DJ', entityType: 'person' },
    });
    expect(categoriesOf(freelancer)).toEqual(['roster']);
  });
});
