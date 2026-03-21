/**
 * Canonical attribute key contract for directory.entities.attributes JSONB.
 *
 * RULE: Every read or write to directory.entities.attributes MUST use keys
 * defined here. Never hard-code a key string inline. This prevents silent
 * JSONB key drift — the most common failure mode when Entity Studio write paths
 * and CRM read paths use slightly different key names.
 *
 * Structure:
 *   PERSON_ATTR   — keys for entity type 'person' (top-level in attributes)
 *   COMPANY_ATTR  — keys for entity type 'company' (top-level in attributes)
 *   VENUE_ATTR    — keys for entity type 'venue' (top-level in attributes)
 *   VENUE_OPS     — keys nested under attributes.venue_ops (read by getVenueOps)
 *   INDIVIDUAL_ATTR — keys for individual client ghost persons
 *   COUPLE_ATTR   — keys for couple entity type
 *
 * Adding a new field:
 *   1. Add the key here under the correct namespace
 *   2. Update the write path (GhostForgeSheet / EntityStudioClient) to import it
 *   3. Update any read paths (getVenueOps, getNetworkStream, etc.) to import it
 *   4. Never write attributes outside this contract
 */

// ─── Person entity keys ────────────────────────────────────────────────────
export const PERSON_ATTR = {
  /** Primary contact email */
  email: 'email',
  /** Direct phone number */
  phone: 'phone',
  /** City / metro market they are based in (e.g. "Nashville", "Los Angeles") */
  market: 'market',
  /** Union affiliation — e.g. "IATSE Local 33", "Teamsters", "Non-union" */
  union_status: 'union_status',
  /** CDL (Commercial Driver's License) — boolean */
  cdl: 'cdl',
  /** W-9 on file — boolean */
  w9_status: 'w9_status',
  /** Certificate of Insurance expiry date — ISO string */
  coi_expiry: 'coi_expiry',
  /** Emergency contact — { name: string; phone: string } */
  emergency_contact: 'emergency_contact',
  /** Instagram handle (without @) */
  instagram: 'instagram',
} as const;

// ─── Company (ghost org) entity keys ──────────────────────────────────────
export const COMPANY_ATTR = {
  /** Ghost org flag — true until claimed */
  is_ghost: 'is_ghost',
  /** Whether this org has been claimed by a user */
  is_claimed: 'is_claimed',
  /** Entity ID of the workspace org that created this ghost */
  created_by_org_id: 'created_by_org_id',
  /** Org category — e.g. 'vendor', 'client', 'coordinator' */
  category: 'category',
  /** Brand color (hex or OKLCH string) */
  brand_color: 'brand_color',
  /** Public website URL */
  website: 'website',
  /** Short description of the company */
  description: 'description',
  /** Mailing / billing address — OrgAddress shape */
  address: 'address',
  /** Social profile links — OrgSocialLinks shape */
  social_links: 'social_links',
  /**
   * Operational settings sub-object — OrgOperationalSettings shape.
   * Contains: tax_id, payment_terms, entity_type, doing_business_as, phone
   */
  operational_settings: 'operational_settings',
  /** Primary support / billing email */
  support_email: 'support_email',
  /** Default invoice currency — e.g. 'USD', 'EUR', 'GBP' */
  default_currency: 'default_currency',
  /** W-9 on file — boolean */
  w9_status: 'w9_status',
  /** Certificate of Insurance expiry date — ISO string */
  coi_expiry: 'coi_expiry',
  /** Payment terms — e.g. 'NET-15', 'NET-30', 'Deposit required' */
  payment_terms: 'payment_terms',
  /** Primary billing contact email (may differ from support_email) */
  billing_email: 'billing_email',
} as const;

// ─── Venue entity keys (top-level) ────────────────────────────────────────
export const VENUE_ATTR = {
  /** Venue type — e.g. 'theater', 'arena', 'club', 'festival' */
  venue_type: 'venue_type',
  /** Venue capacity (seated or standing) */
  capacity: 'capacity',
  /**
   * Venue ops sub-object. Structured operational fields live here (time windows,
   * individual dimensions, contacts). Read by getVenueOps() in the CRM Logistics flight check.
   * Structured fields belong here; free-text note fields below are top-level.
   */
  venue_ops: 'venue_ops',

  // ── Free-text note fields (top-level) — written by Entity Studio VenueTechSpecsCard ──
  // Distinct from the structured VENUE_OPS fields (time windows, numeric dimensions).
  // Top-level storage is intentional: patch_entity_attributes uses shallow || merge,
  // which can only safely write top-level keys without clobbering the venue_ops sub-object.

  /** General load-in / access notes (free text). Distinct from VENUE_OPS.load_in_window. */
  load_in_notes: 'load_in_notes',
  /** Power / electrical notes (free text). Distinct from VENUE_OPS.house_power_amps. */
  power_notes: 'power_notes',
  /**
   * Combined stage dimensions note (free text, e.g. "40ft W × 30ft D × 20ft H").
   * Distinct from the structured VENUE_OPS.stage_width / stage_depth / trim_height fields.
   */
  stage_notes: 'stage_notes',
} as const;

// ─── Venue ops sub-object keys (attributes.venue_ops.*) ───────────────────
/**
 * These are nested under attributes.venue_ops, NOT top-level attributes.
 * Usage: attrs[VENUE_ATTR.venue_ops][VENUE_OPS.dock_address]
 *
 * Read by: src/app/(dashboard)/(features)/crm/actions/get-venue-ops.ts
 * Written by: EntityStudioClient (venue form — Step 4 of network rebuild)
 *
 * ⚠ WARNING: Any key added here must also be handled in getVenueOps().
 * A mismatch silently nulls the CRM Logistics flight check — no error, just missing data.
 */
export const VENUE_OPS = {
  // ── Existing keys (already read by getVenueOps) ──
  /** Parking notes for production vehicles */
  parking_notes: 'parking_notes',
  /** Loading dock hours — e.g. "8am–6pm Mon–Fri" */
  dock_hours: 'dock_hours',
  /** General access notes (gate codes, security contacts) */
  access_notes: 'access_notes',
  /** House production manager name */
  venue_contact_name: 'venue_contact_name',
  /** House production manager direct cell */
  venue_contact_phone: 'venue_contact_phone',
  /** Venue capacity (if stored under venue_ops rather than top-level) */
  capacity: 'capacity',

  // ── New keys (Step 4 / Step 12 of network rebuild) ──
  /**
   * Truck / loading dock address — NOT the main venue address.
   * This is the #1 field missing from every venue database.
   * Format: full street address string (e.g. "123 Loading Dock Rd, rear entrance")
   */
  dock_address: 'dock_address',
  /** Stage width in feet */
  stage_width: 'stage_width',
  /** Stage depth in feet */
  stage_depth: 'stage_depth',
  /** Maximum trim height in feet (how high you can fly) */
  trim_height: 'trim_height',
  /** Load-in time window — e.g. "8:00 AM – 2:00 PM" */
  load_in_window: 'load_in_window',
  /** Load-out time window — e.g. "11:00 PM – 2:00 AM" */
  load_out_window: 'load_out_window',
  /** Hard curfew time — e.g. "11:00 PM" */
  curfew: 'curfew',
  /** Total electrical capacity in amps */
  house_power_amps: 'house_power_amps',
  /** IATSE local number / name — e.g. "IATSE Local 33" */
  union_local: 'union_local',
  /** Whether house PA system is included */
  house_pa_included: 'house_pa_included',
  /** Whether house lighting rig is included */
  house_lighting_included: 'house_lighting_included',
  /** Wi-Fi credentials for production (shown only to workspace members) */
  wifi_credentials: 'wifi_credentials',
  /** Green room count */
  green_room_count: 'green_room_count',
  /** Additional notes for the green room / backstage */
  green_room_notes: 'green_room_notes',
} as const;

// ─── Individual client entity keys ────────────────────────────────────────
/**
 * Keys for directory.entities of type 'person' created as individual clients
 * (category = 'client'). Distinguished from crew/employee persons by the
 * category attribute.
 */
export const INDIVIDUAL_ATTR = {
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  phone: 'phone',
  category: 'category',
} as const;

// ─── Couple entity keys ────────────────────────────────────────────────────
/**
 * Keys for directory.entities of type 'couple'. Both partners' details are
 * stored in attributes. The entity's display_name is the canonical combined
 * name used on proposals, invoices, and CRM.
 *
 * Phase 2 will split these into two person nodes connected by COUPLE_MEMBER
 * and PARTNER cortex edges. For now, all data lives in this JSONB.
 */
export const COUPLE_ATTR = {
  partner_a_first: 'partner_a_first_name',
  partner_a_last: 'partner_a_last_name',
  partner_a_email: 'partner_a_email',
  partner_b_first: 'partner_b_first_name',
  partner_b_last: 'partner_b_last_name',
  partner_b_email: 'partner_b_email',
} as const;

// ─── Type helpers ─────────────────────────────────────────────────────────

export type PersonAttrKey = (typeof PERSON_ATTR)[keyof typeof PERSON_ATTR];
export type CompanyAttrKey = (typeof COMPANY_ATTR)[keyof typeof COMPANY_ATTR];
export type VenueAttrKey = (typeof VENUE_ATTR)[keyof typeof VENUE_ATTR];
export type VenueOpsKey = (typeof VENUE_OPS)[keyof typeof VENUE_OPS];
export type IndividualAttrKey = (typeof INDIVIDUAL_ATTR)[keyof typeof INDIVIDUAL_ATTR];
export type CoupleAttrKey = (typeof COUPLE_ATTR)[keyof typeof COUPLE_ATTR];
