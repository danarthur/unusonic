/**
 * Employed by us, or booked by us.
 *
 * The distinction people hold about their own crew, and the one the section was
 * hiding. It is a grouping rather than a category on purpose: every workforce
 * product studied treats employment type as a field, never as a separate list,
 * and moving a person between categories is the expensive operation everywhere
 * it is published.
 */

import { describe, it, expect } from 'vitest';
import { byEmployment, employmentGroupOf } from '../categories';
import type { NetworkNode } from '../types';

function node(kind: NetworkNode['kind'], name: string): NetworkNode {
  return {
    id: `edge-${name}`,
    entityId: `ent-${name}`,
    kind,
    gravity: 'outer_orbit',
    identity: { name, avatarUrl: null, label: 'Crew', entityType: 'person' },
    meta: {},
  } as NetworkNode;
}

describe('employmentGroupOf', () => {
  it('counts only an employee as staff', () => {
    expect(employmentGroupOf(node('internal_employee', 'Daniel'))).toBe('staff');
  });

  it('treats both routes to a freelancer the same', () => {
    // A contractor added to the roster and a freelancer added through "crew" in
    // the add sheet differ by edge, not by their relationship to the company.
    expect(employmentGroupOf(node('extended_team', 'Brandi'))).toBe('freelance');
    expect(employmentGroupOf(node('external_partner', 'Steve'))).toBe('freelance');
  });
});

describe('byEmployment', () => {
  it('splits a mixed list, staff first', () => {
    const groups = byEmployment([
      node('extended_team', 'Brandi'),
      node('internal_employee', 'Daniel'),
      node('external_partner', 'Steve'),
    ]);

    expect(groups.map((g) => g.group)).toEqual(['staff', 'freelance']);
    expect(groups[0].nodes.map((n) => n.identity.name)).toEqual(['Daniel']);
    expect(groups[1].nodes.map((n) => n.identity.name)).toEqual(['Brandi', 'Steve']);
  });

  it('keeps the order it was given inside each group', () => {
    // Sorting is the caller's decision -- recent, upcoming, name. Grouping must
    // not quietly reorder within a group and undo it.
    const groups = byEmployment([
      node('external_partner', 'Zoe'),
      node('internal_employee', 'Daniel'),
      node('extended_team', 'Alexa'),
    ]);
    expect(groups[1].nodes.map((n) => n.identity.name)).toEqual(['Zoe', 'Alexa']);
  });

  it('says nothing when everybody is freelance', () => {
    // A heading over the whole list names nothing, and a company whose crew is
    // entirely freelance should not be told so on every visit.
    const groups = byEmployment([node('extended_team', 'Brandi'), node('external_partner', 'Steve')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBeNull();
  });

  it('says nothing when everybody is staff', () => {
    const groups = byEmployment([node('internal_employee', 'Daniel')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBeNull();
  });

  it('survives an empty list', () => {
    expect(byEmployment([])).toEqual([{ group: null, nodes: [] }]);
  });
});
