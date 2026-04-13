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
// first_name/last_name are canonical identity fields on crew person entities,
// distinct from INDIVIDUAL_ATTR which serves client-type persons.
export const PERSON_ATTR = {
  /** Given name — crew identity field */
  first_name: 'first_name',
  /** Family name — crew identity field */
  last_name: 'last_name',
  /** Primary job title — e.g. "Audio Engineer", "Lighting Director" */
  job_title: 'job_title',
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
  /** Availability blackout ranges — array of { start: YYYY-MM-DD, end: YYYY-MM-DD } */
  availability_blackouts: 'availability_blackouts',
  /** Instagram handle (without @) */
  instagram: 'instagram',
  /** Spotify user ID (set by OAuth callback) */
  spotify_user_id: 'spotify_user_id',
  /** Spotify display name (set by OAuth callback) */
  spotify_display_name: 'spotify_display_name',
  /** Spotify refresh token — sensitive, never expose to client or Aion */
  spotify_refresh_token: 'spotify_refresh_token',
  /** Root folder path for DJ software (Serato/Rekordbox) music library */
  music_library_path: 'music_library_path',
  /** Whether Apple Music is connected (session-level, MusicKit JS) */
  apple_music_connected: 'apple_music_connected',
} as const;

// ─── Company (ghost org) entity keys ──────────────────────────────────────
// NOTE — Scout-written fields that are NOT in entity attributes:
//   logoUrl   → written to directory.entities.avatar_url column directly (not attributes)
//   entityType → stored as operational_settings.entity_type (sub-key of COMPANY_ATTR.operational_settings)
// These do not need separate top-level keys here.
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
// All venue operational fields are now top-level attributes. The venue_ops
// sub-object is preserved for backwards compat reads but new writes should
// target top-level keys directly via patch_entity_attributes.
export const VENUE_ATTR = {
  /** Venue type — e.g. 'theater', 'arena', 'club', 'festival' */
  venue_type: 'venue_type',
  /** Venue capacity (seated or standing) */
  capacity: 'capacity',

  /**
   * @deprecated Read from top-level keys instead. Kept for backwards compat reads.
   * The venue_ops sub-object is no longer the canonical location for these fields.
   */
  venue_ops: 'venue_ops',

  // ── Address fields ─────────────────────────────────────────────────────
  /**
   * Full address object — { street, city, state, postal_code, country }.
   * Prefer this over individual fields when writing a complete address in one patch.
   */
  address: 'address',
  /**
   * Pre-formatted single-line address string (e.g. "123 Main St, Nashville, TN 37201").
   * Written by Google Places autocomplete and update-event-venue.ts.
   */
  formatted_address: 'formatted_address',
  /** Street address line */
  street: 'street',
  /** City */
  city: 'city',
  /** State / province abbreviation (e.g. "TN", "CA") */
  state: 'state',
  /** Postal / ZIP code */
  postal_code: 'postal_code',

  // ── Free-text note fields ──────────────────────────────────────────────
  /** General load-in / access notes (free text). */
  load_in_notes: 'load_in_notes',
  /** Power / electrical notes (free text). */
  power_notes: 'power_notes',
  /** Combined stage dimensions note (free text, e.g. "40ft W x 30ft D x 20ft H"). */
  stage_notes: 'stage_notes',
  /** Public website URL for the venue. */
  website: 'website',

  // ── Promoted from venue_ops (now top-level) ────────────────────────────
  /** Parking notes for production vehicles */
  parking_notes: 'parking_notes',
  /** Loading dock hours — e.g. "8am-6pm Mon-Fri" */
  dock_hours: 'dock_hours',
  /** General access notes (gate codes, security contacts) */
  access_notes: 'access_notes',
  /** House production manager name */
  venue_contact_name: 'venue_contact_name',
  /** House production manager direct cell */
  venue_contact_phone: 'venue_contact_phone',
  /** Truck / loading dock address — NOT the main venue address */
  dock_address: 'dock_address',
  /** Stage width in feet */
  stage_width: 'stage_width',
  /** Stage depth in feet */
  stage_depth: 'stage_depth',
  /** Maximum trim height in feet (how high you can fly) */
  trim_height: 'trim_height',
  /** Load-in time window — e.g. "8:00 AM - 2:00 PM" */
  load_in_window: 'load_in_window',
  /** Load-out time window — e.g. "11:00 PM - 2:00 AM" */
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

  // ── New fields ─────────────────────────────────────────────────────────
  /** Power voltage — e.g. "120V", "208V", "480V" */
  power_voltage: 'power_voltage',
  /** Power phase — e.g. "single", "3-phase" */
  power_phase: 'power_phase',
  /** Rigging type — e.g. "fly_system", "grid", "ground_support", "none" */
  rigging_type: 'rigging_type',
  /** Number of rigging points available */
  rigging_points_count: 'rigging_points_count',
  /** Maximum weight per rigging point (lbs) */
  rigging_weight_per_point: 'rigging_weight_per_point',
  /** Ceiling height in feet */
  ceiling_height: 'ceiling_height',
  /** Freight elevator details — e.g. "max 4000 lbs, key from security" */
  freight_elevator: 'freight_elevator',
  /** Dock door height */
  dock_door_height: 'dock_door_height',
  /** Dock door width */
  dock_door_width: 'dock_door_width',
  /** Noise ordinance details */
  noise_ordinance: 'noise_ordinance',
  /** Weather exposure — e.g. "indoor", "outdoor", "covered", "tent" */
  weather_exposure: 'weather_exposure',
  /** Crew-specific parking instructions */
  crew_parking_notes: 'crew_parking_notes',
  /** Whether a forklift is available on site */
  forklift_available: 'forklift_available',
  /** Number of dressing rooms */
  dressing_room_count: 'dressing_room_count',
  /** Production office details — toggle with notes */
  production_office: 'production_office',
  /** Catering kitchen availability — toggle with notes */
  catering_kitchen: 'catering_kitchen',
  /** Nearest hospital name and address */
  nearest_hospital: 'nearest_hospital',
  /** ISO timestamp of last venue data verification */
  last_verified_at: 'last_verified_at',
  /** Entity ID or name of who last verified the data */
  verified_by: 'verified_by',
  /** IANA timezone — e.g. "America/New_York". Used by resolveEventTimezone fallback chain. */
  timezone: 'timezone',
} as const;

// ─── Venue ops sub-object keys (DEPRECATED) ──────────────────────────────
/**
 * @deprecated All venue_ops keys have been promoted to top-level attributes.
 * Use VENUE_ATTR instead. This export is kept only for backwards compatibility
 * with existing imports. The string values are identical to the corresponding
 * VENUE_ATTR keys, so code using VENUE_OPS.parking_notes will still resolve
 * to 'parking_notes' — but new code should use VENUE_ATTR.parking_notes.
 *
 * Remove after all consumers are updated to use VENUE_ATTR.
 */
export const VENUE_OPS = {
  parking_notes: 'parking_notes',
  dock_hours: 'dock_hours',
  access_notes: 'access_notes',
  venue_contact_name: 'venue_contact_name',
  venue_contact_phone: 'venue_contact_phone',
  capacity: 'capacity',
  dock_address: 'dock_address',
  stage_width: 'stage_width',
  stage_depth: 'stage_depth',
  trim_height: 'trim_height',
  load_in_window: 'load_in_window',
  load_out_window: 'load_out_window',
  curfew: 'curfew',
  house_power_amps: 'house_power_amps',
  union_local: 'union_local',
  house_pa_included: 'house_pa_included',
  house_lighting_included: 'house_lighting_included',
  wifi_credentials: 'wifi_credentials',
  green_room_count: 'green_room_count',
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
  /**
   * TypeScript alias → JSONB key: `partner_a_first` → `'partner_a_first_name'`.
   * The TS property is a shorthand for readability; the actual JSONB key is the full name.
   * Always use `COUPLE_ATTR.partner_a_first` in code — never the string `'partner_a_first'`.
   */
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
