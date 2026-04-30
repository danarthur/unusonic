/**
 * Shared types for the deal-crew action cluster.
 *
 * Extracted from deal-crew.ts (Phase 0.5-style split, 2026-04-29).
 *
 * Lives in its own file (no `'use server'` directive) so siblings can import
 * types without each one becoming an additional server-action surface. The
 * main `deal-crew.ts` re-exports these for backward compatibility with
 * callers that historically imported them from `./deal-crew`.
 */

export type DealCrewSkill = {
  id: string;
  skill_tag: string;
  proficiency: string | null;
  hourly_rate: number | null;
  verified: boolean;
};

export type DealCrewRow = {
  id: string;
  deal_id: string;
  /** null for role-only rows (e.g. "DJ" slot from a catalog item with no named person) */
  entity_id: string | null;
  role_note: string | null;
  source: 'manual' | 'proposal';
  catalog_item_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  // Resolved entity identity
  entity_name: string | null;
  entity_type: string | null;
  avatar_url: string | null;
  is_ghost: boolean;
  // Person attribute fields (null for open role slots)
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  phone: string | null;
  market: string | null;
  union_status: string | null;
  w9_status: boolean;
  coi_expiry: string | null;
  // Roster edge context (null if person is not on workspace roster)
  employment_status: 'internal_employee' | 'external_contractor' | null;
  roster_rel_id: string | null;
  // Skills
  skills: DealCrewSkill[];
  // Contact
  email: string | null;
  // Package reference
  package_name: string | null;
  // Ops dispatch fields (Phase A — used by Plan tab)
  dispatch_status: 'standby' | 'en_route' | 'on_site' | 'wrapped' | null;
  call_time: string | null;
  call_time_slot_id: string | null;
  arrival_location: string | null;
  day_rate: number | null;
  crew_notes: string | null;
  // Department grouping + confirmation
  department: string | null;
  declined_at: string | null;
  // Payment tracking
  payment_status: string | null;
  travel_stipend: number | null;
  per_diem: number | null;
  kit_fee: number | null;
  // Gear awareness (Phase 1)
  brings_own_gear: boolean;
  gear_notes: string | null;
  // Crew Hub (Phase 1) — explicit state machine + comms summary. PM notes
  // live on the existing `notes` column (surfaced as `crew_notes` above);
  // the short-lived `internal_note` column was dropped once the rail editor
  // was pointed at the shared notes field.
  status: 'pending' | 'offered' | 'tentative' | 'confirmed' | 'declined' | 'replaced';
  day_sheet_sent_count: number;
  last_day_sheet_sent_at: string | null;
  last_day_sheet_delivered_at: string | null;
  last_day_sheet_bounced_at: string | null;
};

/**
 * Crew-search result row. Surfaces ROSTER_MEMBER person entities first
 * ("Your team"), then falls back to the broader workspace entity graph
 * ("Network"). Used by ProductionTeamCard's "Add crew" picker. Do NOT use
 * the network search for crew — it excludes ROSTER_MEMBER entities.
 */
export type CrewSearchResult = {
  entity_id: string;
  name: string;
  job_title: string | null;
  avatar_url: string | null;
  is_ghost: boolean;
  employment_status: 'internal_employee' | 'external_contractor' | null;
  skills: string[];        // denormalized tag array for display only
  equipment: string[];     // equipment names from ops.crew_equipment (Phase 4)
  _section: 'team' | 'network';
};
