/**
 * Network entity – B2B connections (org_relationships).
 * CRM Rolodex: source_org links to target_org (vendor/venue/client/partner).
 * Network Orbit: unified node type for Core (employees) + Inner Circle (partners).
 */

export type RelationshipType = 'vendor' | 'venue' | 'client_company' | 'partner';

/** A cortex.relationships edge type as it appears on a network node. */
export type RoleEdge = 'ROSTER_MEMBER' | 'PARTNER' | 'VENDOR' | 'CLIENT' | 'VENUE_PARTNER';

/** Unified node for the Network Orbit stream (org_members + org_relationships). */
export type NetworkNode = {
  id: string;
  entityId: string;
  kind: 'internal_employee' | 'extended_team' | 'external_partner';
  gravity: 'core' | 'inner_circle' | 'outer_orbit';
  /**
   * Raw cortex.relationships.relationship_type for external_partner nodes,
   * or 'ROSTER_MEMBER' for employees / extended team. Drives the "is this a
   * client vs. freelancer" classification downstream — a person on a CLIENT
   * edge is a wedding host or individual client, not a freelancer.
   */
  relationshipType?: RoleEdge;
  /**
   * Every role edge this entity holds with the workspace, deduplicated.
   *
   * An entity can genuinely hold several at once -- a venue that also sub-rents
   * you gear is VENUE_PARTNER + VENDOR; a client whose AV manager freelances for
   * you is CLIENT + PARTNER. Nodes used to be built one-per-edge, so those
   * entities rendered as two separate rows in two different zones.
   *
   * `relationshipType` remains the primary role for existing callers; `roles`
   * is the full set and is what category membership should be derived from.
   */
  roles?: RoleEdge[];
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    /** Entity type from directory.entities.type — used to pick correct avatar icon */
    entityType?: 'person' | 'company' | 'venue' | 'couple';
  };
  /** Grouping key for the Crew zone — derived from job_title or first skill tag. Null renders under "Other". */
  roleGroup?: string | null;
  /**
   * Whether the CURRENT user has starred this entity. Personal and silent --
   * colleagues do not see it, and it never affects category membership. The
   * shared "preferred" judgement is the relationship tier, not this.
   */
  starred?: boolean;
  /**
   * Controlled craft roles from ops.crew_skills.role_tag. Multi-value because
   * dual-role is the norm here -- the DJ who also MCs, the tech who also
   * drives. Distinct from permission roles (ops.workspace_roles).
   */
  crewRoles?: string[];
  /**
   * People currently affiliated with this COMPANY node (MEMBER / EMPLOYEE /
   * WORKS_FOR / EMPLOYED_AT / PARTNER / ROSTER_MEMBER edges that have not
   * ended).
   *
   * Populated for company and venue nodes. This is how a planner working under
   * a parent company becomes reachable at all: people like these often have no
   * direct edge from the workspace, so before this they existed in the graph
   * but appeared nowhere on the contacts page.
   */
  affiliates?: { entityId: string; name: string; jobTitle: string | null }[];
  /**
   * The company this PERSON currently works for, if any. Live, not frozen --
   * this answers "where are they now", which is the opposite of the frozen
   * stamps on deals and referrals, which answer "where were they then".
   */
  employer?: { entityId: string; name: string } | null;
  meta: {
    email?: string;
    phone?: string;
    tags?: string[];
    doNotRebook?: boolean;
    archived?: boolean;
    /** Outstanding invoice balance for external_partner nodes. Only set when > 0. */
    outstanding_balance?: number;
    /** ISO date string from cortex.relationships.created_at — when this connection was established. */
    connectedSince?: string;
    /** W-9 on file — populated for person (roster member) nodes. */
    w9_status?: boolean | null;
    /** COI expiry ISO date string — populated for person (roster member) nodes. */
    coi_expiry?: string | null;
    /** City/metro market — populated for person (roster member) nodes. */
    market?: string | null;
    /** Union affiliation string — populated for person (roster member) nodes. */
    union_status?: string | null;
    /** Number of deals this entity has referred to the workspace. Only set when > 0. */
    referral_count?: number;
    /** Business function capabilities from ops.entity_capabilities. */
    capabilities?: string[];
    /**
     * Most recent show already worked with this entity, ISO date.
     *
     * The standing signal the contacts page is actually opened for. Distinct
     * from `connectedSince`, which is when the row was created and never
     * changes -- tenure is a profile fact, recency is a scanning fact.
     */
    lastWorked?: string | null;
    /** Next show ahead, ISO date. Null when nothing is on the books. */
    nextBooked?: string | null;
    /**
     * Whether `nextBooked` is a scheduled event rather than a proposed deal
     * date. A proposal is not a booking and the card must not imply it is.
     */
    nextConfirmed?: boolean;
  };
};

export interface OrgRelationshipRow {
  id: string;
  source_org_id: string;
  target_org_id: string;
  type: RelationshipType;
  notes: string | null;
  created_at: string;
}

/** Connection card: relationship + target org (for Network list). */
export interface OrgConnectionItem {
  id: string;
  source_org_id: string;
  target_org_id: string;
  type: RelationshipType;
  notes: string | null;
  created_at: string;
  target_org: {
    id: string;
    name: string;
    is_ghost: boolean;
    address?: { city?: string; state?: string } | null;
  };
}
