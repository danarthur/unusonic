/**
 * Network categories — what an entity is to the workspace.
 *
 * Derived from the role edges an entity holds, never from a stored column and
 * never from the star. The three zones this replaces (Crew / Inner Circle /
 * Network) answered three different questions -- a kind, a preference and a
 * leftover -- so starring someone moved them between zones and unstarred
 * clients were indistinguishable from unstarred freelancers.
 *
 * Membership is deliberately NOT exclusive. A venue that also sub-rents you
 * gear belongs in Venues and Vendors; a client whose AV manager freelances for
 * you belongs in Clients and Roster. All three of those overlaps exist in the
 * pilot workspace today.
 */

import type { NetworkNode, RoleEdge } from './types';

export type NetworkCategory = 'clients' | 'roster' | 'vendors' | 'venues';

/** Fixed order. Clients lead because they are the only relationship carrying money and a clock. */
export const CATEGORY_ORDER: NetworkCategory[] = ['clients', 'roster', 'vendors', 'venues'];

/**
 * Default labels. `roster` is the one workspaces are expected to rename
 * (Crew / Talent / Team); clients and venues stay fixed because they are
 * already the industry's own words.
 */
export const CATEGORY_LABELS: Record<NetworkCategory, string> = {
  clients: 'Clients',
  roster: 'Roster',
  vendors: 'Vendors',
  venues: 'Venues',
};

/**
 * Which role edges place an entity in which category.
 *
 * PARTNER is absent on purpose: it is a catch-all written by summonPartner for
 * anything added as a generic connection, covering both freelance people and
 * partner companies such as planners and coordinators. Mapping it wholesale to
 * roster put companies in a category defined as "people you put on jobs".
 * It is resolved by entity type in categoriesOf instead.
 */
const ROLE_TO_CATEGORY: Partial<Record<RoleEdge, NetworkCategory>> = {
  CLIENT: 'clients',
  ROSTER_MEMBER: 'roster',
  VENDOR: 'vendors',
  VENUE_PARTNER: 'venues',
};

/**
 * Every category this node belongs to.
 *
 * Falls back to `relationshipType` for nodes built before `roles` existed, and
 * to `kind` for roster members, whose edge type is implied rather than stored
 * on the partner edge.
 */
/**
 * The role edges a node carries, tolerating nodes built before `roles` existed
 * (they carry a single `relationshipType` instead). Shared with
 * `mergeNodesByEntity`, which needs the identical fallback.
 */
export function rolesOf(node: NetworkNode): RoleEdge[] {
  if (node.roles?.length) return node.roles;
  if (node.relationshipType) return [node.relationshipType];
  return [];
}

/**
 * Which category a PARTNER edge puts someone in.
 *
 * PARTNER is a documented catch-all: summonPartner writes it for freelance
 * people and for partner companies alike, so it cannot decide this alone. A
 * company is never someone you put on a job, and a person on a PARTNER edge
 * and nothing else is the freelancer pattern that summonPersonGhost writes.
 *
 * The case this exists for is a person holding BOTH: a client or a vendor who
 * also carries a partner edge. Those were landing in the roster as well as
 * their real category -- so a coordinator who hires you, or a client, appeared
 * in your own crew. The outward-facing role is the true one, and PARTNER
 * alongside it adds nothing, so it contributes no category rather than
 * inventing a second one.
 *
 * Deliberately not keyed on tier or gravity. Those are preference axes and must
 * not move anyone between categories.
 */
function partnerCategory(node: NetworkNode, roles: RoleEdge[]): NetworkCategory | null {
  if (node.identity.entityType !== 'person') return 'vendors';

  const worksWithUs = roles.some(
    (r) => r === 'CLIENT' || r === 'VENDOR' || r === 'VENUE_PARTNER',
  );
  return worksWithUs ? null : 'roster';
}

export function categoriesOf(node: NetworkNode): NetworkCategory[] {
  const roles = rolesOf(node);

  const out = new Set<NetworkCategory>();
  for (const role of roles) {
    if (role === 'PARTNER') {
      const partnerCat = partnerCategory(node, roles);
      if (partnerCat) out.add(partnerCat);
      continue;
    }
    const cat = ROLE_TO_CATEGORY[role];
    if (cat) out.add(cat);
  }

  // Employees and extended team are roster by definition, even if the edge
  // type never made it onto the node.
  if (node.kind === 'internal_employee' || node.kind === 'extended_team') {
    out.add('roster');
  }

  return CATEGORY_ORDER.filter((c) => out.has(c));
}

/** True when the node belongs in the given category. */
export function isInCategory(node: NetworkNode, category: NetworkCategory): boolean {
  return categoriesOf(node).includes(category);
}

/**
 * Nodes holding no recognised role. These are a holding pen to be emptied, not
 * a fifth category -- a residual bucket people can live in forever accumulates
 * exactly the records that matter most and are hardest to find.
 */
export function isUnsorted(node: NetworkNode): boolean {
  return categoriesOf(node).length === 0;
}
