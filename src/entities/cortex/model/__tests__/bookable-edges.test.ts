/**
 * Which end of the edge is us.
 *
 * `do_not_rebook` was roster-only on both writers while every reader already
 * handled any edge type — so a freelancer could be flagged by the contact card
 * and never by a person. Lifting the type filter is the easy half. The trap is
 * direction, and getting it wrong fails silently on somebody who is plainly
 * there.
 */

import { describe, it, expect } from 'vitest';
import {
  BOOKABLE_EDGE_TYPES,
  isBookableEdgeType,
  orgEndOf,
} from '../bookable-edges';

const ORG = 'org-entity';

describe('orgEndOf', () => {
  it('reads source for an outside relationship', () => {
    // A guard that read `target` here would compare the freelancer's id against
    // the workspace org and always refuse.
    expect(orgEndOf({
      source_entity_id: ORG,
      target_entity_id: 'freelancer',
      relationship_type: 'PARTNER',
    })).toBe(ORG);
  });

  it('reads target for a roster member, which points the other way', () => {
    expect(orgEndOf({
      source_entity_id: 'crew-person',
      target_entity_id: ORG,
      relationship_type: 'ROSTER_MEMBER',
    })).toBe(ORG);
  });

  it('finds the org end of a vendor and a venue too', () => {
    for (const relationship_type of ['VENDOR', 'VENUE_PARTNER']) {
      expect(orgEndOf({
        source_entity_id: ORG,
        target_entity_id: 'them',
        relationship_type,
      })).toBe(ORG);
    }
  });
});

describe('BOOKABLE_EDGE_TYPES', () => {
  it('covers the people you book or hire', () => {
    expect(isBookableEdgeType('PARTNER')).toBe(true);
    expect(isBookableEdgeType('ROSTER_MEMBER')).toBe(true);
    expect(isBookableEdgeType('VENDOR')).toBe(true);
    expect(isBookableEdgeType('VENUE_PARTNER')).toBe(true);
  });

  it('leaves clients out', () => {
    // You do not rebook a client. The label would be answering a different
    // question if it appeared on one.
    expect(isBookableEdgeType('CLIENT')).toBe(false);
    expect(BOOKABLE_EDGE_TYPES).not.toContain('CLIENT');
  });

  it('leaves CO_HOST out — a couple is not something you book', () => {
    expect(isBookableEdgeType('CO_HOST')).toBe(false);
  });
});
