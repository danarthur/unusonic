/**
 * Which relationships can be flagged "do not rebook", and which end of one is us.
 *
 * Pure, and in its own module because `roster-actions.ts` is a `'use server'`
 * file and those may only export async functions — the same constraint that has
 * pushed every other piece of shared logic out of an action in this codebase.
 *
 * @module entities/cortex/model/bookable-edges
 */

export type EdgeEnds = {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
};

/**
 * Anyone you book or hire.
 *
 * CLIENT is deliberately absent: you do not rebook a client, and the label
 * would be answering a different question.
 */
export const BOOKABLE_EDGE_TYPES = [
  'ROSTER_MEMBER',
  'PARTNER',
  'VENDOR',
  'VENUE_PARTNER',
] as const;

export type BookableEdgeType = (typeof BOOKABLE_EDGE_TYPES)[number];

export function isBookableEdgeType(type: string): type is BookableEdgeType {
  return (BOOKABLE_EDGE_TYPES as readonly string[]).includes(type);
}

/**
 * The end of the edge that is the workspace's own org entity.
 *
 * ROSTER_MEMBER points person -> org; every outside relationship points the
 * other way, org -> them. This is the actual trap in letting a freelancer be
 * flagged, not the type filter: a guard that checks `target` on a PARTNER edge
 * is asking whether the freelancer is a workspace, and the failure mode is a
 * silent "not found" on a person who is plainly there.
 */
export function orgEndOf(edge: EdgeEnds): string {
  return edge.relationship_type === 'ROSTER_MEMBER'
    ? edge.target_entity_id
    : edge.source_entity_id;
}
