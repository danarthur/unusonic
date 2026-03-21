/**
 * Network Manager – Types for the Liquid Grid (orgs, entities, private data).
 * @module features/network/model/types
 */

export type AffiliationAccessLevel = 'admin' | 'member' | 'read_only';

export type NetworkBadgeKind = 'vendor' | 'venue' | 'coordinator' | 'client';

export interface NetworkEntity {
  id: string;
  email: string;
  is_ghost: boolean;
  role_label: string | null;
  access_level: AffiliationAccessLevel;
  /** Org IDs this entity is affiliated with (for avatar logos). */
  organization_ids: string[];
  /** Skill tags for this entity in the current org (from talent_skills). Holographic Roster badges. */
  skill_tags?: string[];
  /** org_members.id when this person is a member of the current org (for Deep Edit sheet). */
  org_member_id?: string | null;
}

export interface NetworkOrganization {
  id: string;
  name: string;
  slug: string | null;
  is_claimed: boolean;
  claimed_at: string | null;
  created_by_org_id: string | null;
  /** Badge in grid: vendor, venue, coordinator, client. */
  category: NetworkBadgeKind | null;
  /** Our private notes/rating about this org (only when owner_org_id = current_org). */
  private_notes: string | null;
  internal_rating: number | null;
  /** Entities (people) linked to this org. */
  roster: NetworkEntity[];
}

export interface NetworkGraph {
  /** Current org (operator) – e.g. Invisible Touch. */
  current_org_id: string;
  organizations: NetworkOrganization[];
  /** Flat list of entities for grid cards that represent people. */
  entities: (NetworkEntity & { organization_names: string[]; skill_tags?: string[]; org_member_id?: string | null })[];
}

export type ValidateInvitationResult =
  | { ok: true; email: string; org_name: string; organization_id: string }
  | { ok: false; error: string };
