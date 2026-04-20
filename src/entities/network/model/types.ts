/**
 * Network entity – B2B connections (org_relationships).
 * CRM Rolodex: source_org links to target_org (vendor/venue/client/partner).
 * Network Orbit: unified node type for Core (employees) + Inner Circle (partners).
 */

export type RelationshipType = 'vendor' | 'venue' | 'client_company' | 'partner';

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
  relationshipType?: 'ROSTER_MEMBER' | 'PARTNER' | 'VENDOR' | 'CLIENT' | 'VENUE_PARTNER';
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    /** Entity type from directory.entities.type — used to pick correct avatar icon */
    entityType?: 'person' | 'company' | 'venue' | 'couple';
  };
  /** Grouping key for the Crew zone — derived from job_title or first skill tag. Null renders under "Other". */
  roleGroup?: string | null;
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
