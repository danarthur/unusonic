/**
 * Network Orbit – Shared types for read/query actions.
 * No 'use server' here — pure types so siblings can import without circular issues.
 * @module features/network-data/api/network-read-actions/types
 */

export type NetworkSearchOrg = {
  id: string;
  /** The directory.entities UUID — always set, used for roster lookups. */
  entity_uuid?: string;
  name: string;
  logo_url?: string | null;
  is_ghost?: boolean;
  /** Entity type from directory.entities — 'company', 'person', 'couple', 'venue', etc. */
  entity_type?: string | null;
  /** 'connection' = already in your rolodex; 'global' = public Unusonic directory. */
  _source?: 'connection' | 'global';
};

export type NodeDetailCrewMember = {
  /**
   * Relationship id (cortex.relationships.id) — used by existing write paths
   * like addContactToGhostOrg. NOT a directory.entities id; do NOT route on it.
   */
  id: string;
  /**
   * The person's actual directory.entities id. Use this for navigation
   * (e.g. `/network/entity/{subjectEntityId}`). May be null only for
   * synthetic rows (optimistic pending adds before the server refetches).
   */
  subjectEntityId: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
};

export type NodeDetail = {
  id: string;
  kind: 'internal_employee' | 'extended_team' | 'external_partner';
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    email?: string;
  };
  /** Relationship direction for partners: vendor (money out), client (money in), partner (both). */
  direction: 'vendor' | 'client' | 'partner' | null;
  /**
   * Raw relationship type string as returned by the server before collapsing to direction.
   * Values: 'vendor' | 'venue' | 'client' | 'client_company' | 'partner'.
   * Use this (not `direction`) when initialising edit-form state so venue relationships
   * don't get silently reclassified to vendor on save.
   */
  relationshipTypeRaw?: string | null;
  balance: { inbound: number; outbound: number };
  active_events: string[];
  /** Only for external_partner: org_relationships.notes. */
  notes: string | null;
  /** For external_partner: relationship id for updating notes. */
  relationshipId: string | null;
  /** For external_partner: target org is unclaimed (ghost). Enables "Summon" UI. */
  isGhost: boolean;
  /** For external_partner: target org id (for summon). */
  targetOrgId: string | null;
  /** For external_partner: org display (Liquid Identity banner). */
  orgSlug?: string | null;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  orgWebsite?: string | null;
  /** For external_partner: roster of target org (Crew tab). */
  crew?: NodeDetailCrewMember[];
  // Extended profile (ghost org + relationship)
  orgSupportEmail?: string | null;
  orgAddress?: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  orgDefaultCurrency?: string | null;
  orgCategory?: string | null;
  /** operational_settings: tax_id, payment_terms, entity_type, doing_business_as, phone */
  orgOperationalSettings?: Record<string, unknown> | null;
  relationshipTier?: string | null;
  relationshipTags?: string[] | null;
  lifecycleStatus?: 'prospect' | 'active' | 'dormant' | 'blacklisted' | null;
  blacklistReason?: string | null;
  /** For internal_employee: invite status — 'ghost' (unsent), 'invited' (pending), 'active' (claimed). */
  inviteStatus?: 'ghost' | 'invited' | 'active' | null;
  /** For internal_employee: org_members.role (owner | admin | member | restricted). */
  memberRole?: 'owner' | 'admin' | 'member' | 'restricted' | null;
  /** For internal_employee: whether current user can assign admin/manager (owner or admin). */
  canAssignElevatedRole?: boolean;
  /** For internal_employee: do-not-rebook flag from ROSTER_MEMBER edge context_data. */
  doNotRebook?: boolean;
  /** For internal_employee: archived flag from ROSTER_MEMBER edge context_data. */
  archived?: boolean;
  /** For internal_employee: phone from directory.entities.attributes. */
  phone?: string | null;
  /** For internal_employee: market from directory.entities.attributes. */
  market?: string | null;
  /**
   * Audit trail for the ROSTER_MEMBER edge — set by the Postgres trigger whenever
   * context_data changes. Surfaces on hover in the detail sheet.
   */
  lastModifiedAt?: string | null;
  lastModifiedByName?: string | null;
  /**
   * The `directory.entities.id` of the subject being viewed (person or org).
   * Distinct from `id` which is the cortex relationship edge ID.
   * Use this for context panel queries (crew schedule, deals, finance).
   */
  subjectEntityId?: string | null;
  /** The `directory.entities.type` value ('person', 'company', 'venue', etc.) */
  entityDirectoryType?: string | null;
  /** For external_partner person entities: email from INDIVIDUAL_ATTR */
  personEmail?: string | null;
  /** For external_partner person entities: phone from INDIVIDUAL_ATTR */
  personPhone?: string | null;
  /** For external_partner couple entities: partner B email */
  couplePartnerBEmail?: string | null;
  /** For external_partner couple entities: partner A full name */
  couplePartnerAName?: string | null;
  /** For external_partner couple entities: partner B full name */
  couplePartnerBName?: string | null;
  /** For crew entities: skill tags from ops.crew_skills. */
  skillTags?: string[];
  /** For crew entities: most recent confirmed assignment. */
  lastBooked?: {
    eventTitle: string;
    role: string;
    date: string; // ISO
  } | null;
  /** For crew entities: total day_rate paid across confirmed assignments. */
  totalPaid?: number | null;
  /** For crew entities: count of confirmed assignments. */
  showCount?: number | null;
  /** Venue-specific technical spec fields, from directory.entities.attributes */
  orgVenueSpecs?: {
    capacity?: number | null;
    load_in_notes?: string | null;
    power_notes?: string | null;
    stage_notes?: string | null;
  } | null;
  /** For external_partner: total invoiced amount (clients) or total spent (vendors). */
  lifetimeValue?: number | null;
  /** For external_partner: ISO date of most recent event involving this entity. */
  lastActiveDate?: string | null;
  /** For external_partner: count of events this partner was involved in. */
  partnerShowCount?: number | null;
  /** Computed relationship strength based on recency, frequency, and value. */
  relationshipStrength?: 'new' | 'growing' | 'strong' | 'cooling' | null;
};
