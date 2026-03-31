/**
 * Organization entity – Membership (org_members) and org profile types.
 * Gatekeeper layer: profile ↔ org with employment_status and role.
 */

export type EmploymentStatus = 'internal_employee' | 'external_contractor';
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member' | 'restricted';

// Legacy row shapes (organizations + org_members tables dropped in Session 10; kept for backward compat)
export interface OrgRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string | null;
  is_claimed: boolean;
  is_ghost: boolean;
  logo_url: string | null;
  brand_color: string | null;
  website: string | null;
  description: string | null;
  support_email: string | null;
  default_currency: string | null;
  category: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface OrgMemberRow {
  id: string;
  org_id: string;
  profile_id: string | null;
  entity_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  role: OrgMemberRole;
  default_hourly_rate: number;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export type OrgMemberInsert = Partial<OrgMemberRow> & { org_id: string };
export type OrgMemberUpdate = Partial<OrgMemberRow>;

/** Address for Digital Twin (map logic later). City/State required for map pins. */
export interface OrgAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

/** Social / Digital Twin links. */
export interface OrgSocialLinks {
  website?: string;
  instagram?: string;
  linkedin?: string;
}

/** Operational defaults. */
export interface OrgOperationalSettings {
  currency?: string;
  timezone?: string;
}

/** Full organization profile for Event Studio (includes new columns from migration). */
export interface OrgDetails {
  id: string;
  name: string;
  slug: string | null;
  workspace_id: string;
  brand_color: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  address: OrgAddress | null;
  social_links: OrgSocialLinks | null;
  operational_settings: OrgOperationalSettings | null;
  support_email: string | null;
  default_currency: string | null;
  category: string | null;
  is_claimed: boolean;
  is_ghost: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Roster list item: org_member + entity (for display). Ghosts have profile_id null. */
export interface OrgMemberRosterItem {
  id: string;
  org_id: string;
  entity_id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  role: OrgMemberRole;
  /** From entity; used when profile_id is null (ghost). */
  email: string;
  is_ghost: boolean;
  /** first_name + last_name, or email fallback. */
  display_name: string;
  skill_tags: string[];
  /** Public URL for member/ghost avatar (org_members.avatar_url). */
  avatar_url: string | null;
}
