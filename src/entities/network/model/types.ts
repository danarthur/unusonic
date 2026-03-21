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
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    /** Entity type from directory.entities.type — used to pick correct avatar icon */
    entityType?: 'person' | 'company' | 'venue' | 'couple';
  };
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
