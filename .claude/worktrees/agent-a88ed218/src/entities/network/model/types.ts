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
  kind: 'internal_employee' | 'external_partner';
  gravity: 'core' | 'inner_circle' | 'outer_orbit';
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
  };
  meta: {
    email?: string;
    phone?: string;
    tags?: string[];
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
