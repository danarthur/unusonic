/**
 * Typed accessor for directory.entities.attributes JSONB.
 *
 * Two exports:
 *
 * `readEntityAttrs` — For UI server actions. Returns typed struct. Unknown keys are
 * silently ignored. Use this for all CRM reads and network-data surfaces.
 *
 * `toIONContext` — For Aion agent context building. Returns all non-null attributes as
 * flat strings. Do not use `readEntityAttrs` for LLM context — this function preserves
 * unknown keys that readEntityAttrs would drop.
 *
 * SECURITY: Never call `patch_entity_attributes` via the system client without an explicit
 * `owner_workspace_id` guard — this RPC has no inline ownership check and relies on the
 * caller using the session client (RLS-enforced).
 *
 * Design notes:
 * - Separate named schemas per entity type (not a discriminated union — Zod maintainers
 *   are deprecating z.discriminatedUnion).
 * - String fields use `.nullable().optional()` — absent keys return undefined; explicit
 *   nulls return null. This is correct: empty string is indistinguishable from user-set
 *   blank in JSONB, so we never default missing strings to ''.
 * - Boolean flags use `.catch(false)` — absent keys default to false (safe sentinel).
 * - Display name parts (first_name, last_name on IndividualAttrs / CoupleAttrs) use
 *   `.catch('')` for backwards compat with callers that join with space.
 * - Nested objects (address, venue_ops, operational_settings) use `.nullable().optional()` —
 *   absent sub-objects are undefined; never a partial object.
 */

import { z } from 'zod';
import {
  PERSON_ATTR,
  COMPANY_ATTR,
  VENUE_ATTR,
  VENUE_OPS,
  INDIVIDUAL_ATTR,
  COUPLE_ATTR,
} from '@/entities/directory/model/attribute-keys';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Nullable optional string: undefined when absent, null when explicitly null. */
const optStr = z.string().nullable().optional();

/** Boolean flag: returns false when absent. */
const boolFlag = z.boolean().catch(false);

// ─── Sub-object schemas ───────────────────────────────────────────────────────

/**
 * Address sub-object used by both CompanyAttrs and VenueAttrs.
 * Returns undefined when the key is absent; null when explicitly null.
 */
const AddressSchema = z
  .object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  })
  .nullable()
  .optional();

/**
 * OrgOperationalSettings sub-object (attributes.operational_settings).
 * Contains: tax_id, payment_terms, entity_type, doing_business_as, phone.
 * `entity_type` stores the Scout-written value (not in a top-level COMPANY_ATTR key —
 * see attribute-keys.ts for the NOTE on Scout-written fields).
 */
const OperationalSettingsSchema = z
  .object({
    tax_id: z.string().nullable().optional(),
    payment_terms: z.string().nullable().optional(),
    entity_type: z.string().nullable().optional(),
    doing_business_as: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * OrgSocialLinks sub-object (attributes.social_links).
 */
const SocialLinksSchema = z
  .object({
    twitter: z.string().nullable().optional(),
    linkedin: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * EmergencyContact sub-object (person attributes.emergency_contact).
 */
const EmergencyContactSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

// ─── VenueOps sub-object schema ───────────────────────────────────────────────

const VenueOpsSchema = z
  .object({
    [VENUE_OPS.parking_notes]: optStr,
    [VENUE_OPS.dock_hours]: optStr,
    [VENUE_OPS.access_notes]: optStr,
    [VENUE_OPS.venue_contact_name]: optStr,
    [VENUE_OPS.venue_contact_phone]: optStr,
    [VENUE_OPS.capacity]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.dock_address]: optStr,
    [VENUE_OPS.stage_width]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.stage_depth]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.trim_height]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.load_in_window]: optStr,
    [VENUE_OPS.load_out_window]: optStr,
    [VENUE_OPS.curfew]: optStr,
    [VENUE_OPS.house_power_amps]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.union_local]: optStr,
    [VENUE_OPS.house_pa_included]: z.boolean().nullable().optional(),
    [VENUE_OPS.house_lighting_included]: z.boolean().nullable().optional(),
    [VENUE_OPS.wifi_credentials]: optStr,
    [VENUE_OPS.green_room_count]: z.union([z.string(), z.number()]).nullable().optional(),
    [VENUE_OPS.green_room_notes]: optStr,
  })
  .nullable()
  .optional();

// ─── Per-type attribute schemas ───────────────────────────────────────────────

/**
 * Schema for entity type 'person' (crew members, contacts).
 * Use `readEntityAttrs(raw, 'person')` to get PersonAttrs.
 */
export const PersonAttrsSchema = z.object({
  [PERSON_ATTR.first_name]: z.string().catch(''),
  [PERSON_ATTR.last_name]: z.string().catch(''),
  [PERSON_ATTR.job_title]: optStr,
  skills: z.array(z.string()).catch([]),   // denormalized snapshot — written by Phase 4 skill mutations
  [PERSON_ATTR.email]: optStr,
  [PERSON_ATTR.phone]: optStr,
  [PERSON_ATTR.market]: optStr,
  [PERSON_ATTR.union_status]: optStr,
  [PERSON_ATTR.cdl]: boolFlag,
  [PERSON_ATTR.w9_status]: boolFlag,
  [PERSON_ATTR.coi_expiry]: optStr,
  [PERSON_ATTR.emergency_contact]: EmergencyContactSchema,
  [PERSON_ATTR.instagram]: optStr,
});

/**
 * Schema for entity type 'company' (ghost orgs, vendors, clients, partners).
 * Use `readEntityAttrs(raw, 'company')` to get CompanyAttrs.
 */
export const CompanyAttrsSchema = z.object({
  [COMPANY_ATTR.is_ghost]: boolFlag,
  [COMPANY_ATTR.is_claimed]: boolFlag,
  [COMPANY_ATTR.created_by_org_id]: optStr,
  [COMPANY_ATTR.category]: optStr,
  [COMPANY_ATTR.brand_color]: optStr,
  [COMPANY_ATTR.website]: optStr,
  [COMPANY_ATTR.description]: optStr,
  [COMPANY_ATTR.address]: AddressSchema,
  [COMPANY_ATTR.social_links]: SocialLinksSchema,
  [COMPANY_ATTR.operational_settings]: OperationalSettingsSchema,
  [COMPANY_ATTR.support_email]: optStr,
  [COMPANY_ATTR.default_currency]: optStr,
  [COMPANY_ATTR.w9_status]: boolFlag,
  [COMPANY_ATTR.coi_expiry]: optStr,
  [COMPANY_ATTR.payment_terms]: optStr,
  [COMPANY_ATTR.billing_email]: optStr,
});

/**
 * Schema for entity type 'venue'.
 * Use `readEntityAttrs(raw, 'venue')` to get VenueAttrs.
 */
export const VenueAttrsSchema = z.object({
  [VENUE_ATTR.venue_type]: optStr,
  [VENUE_ATTR.capacity]: z.union([z.string(), z.number()]).nullable().optional(),
  [VENUE_ATTR.venue_ops]: VenueOpsSchema,
  [VENUE_ATTR.address]: AddressSchema,
  [VENUE_ATTR.formatted_address]: optStr,
  [VENUE_ATTR.street]: optStr,
  [VENUE_ATTR.city]: optStr,
  [VENUE_ATTR.state]: optStr,
  [VENUE_ATTR.postal_code]: optStr,
  [VENUE_ATTR.load_in_notes]: optStr,
  [VENUE_ATTR.power_notes]: optStr,
  [VENUE_ATTR.stage_notes]: optStr,
  [VENUE_ATTR.website]: optStr,
});

/**
 * Schema for entity type 'person' used as an individual client (category = 'client').
 * Use `readEntityAttrs(raw, 'individual')` to get IndividualAttrs.
 */
export const IndividualAttrsSchema = z.object({
  // Default '' for first_name / last_name — callers join with space.
  [INDIVIDUAL_ATTR.first_name]: z.string().catch(''),
  [INDIVIDUAL_ATTR.last_name]: z.string().catch(''),
  [INDIVIDUAL_ATTR.email]: optStr,
  [INDIVIDUAL_ATTR.phone]: optStr,
  [INDIVIDUAL_ATTR.category]: optStr,
});

/**
 * Schema for entity type 'couple'.
 * Note: email is intentionally absent — couple entities do not have a top-level email field.
 * Use `readEntityAttrs(raw, 'couple')` to get CoupleAttrs. If you receive undefined for email
 * on a couple entity that was reclassified from a person, this is correct behaviour —
 * the old email key is preserved in JSONB but is not exposed via this accessor.
 *
 * `category` is included so the Zod-parsed output can be sent directly to
 * `patch_entity_attributes` without needing to re-add it outside the validated object.
 */
export const CoupleAttrsSchema = z.object({
  [COUPLE_ATTR.partner_a_first]: z.string().catch(''),
  [COUPLE_ATTR.partner_a_last]: z.string().catch(''),
  [COUPLE_ATTR.partner_a_email]: optStr,
  [COUPLE_ATTR.partner_b_first]: z.string().catch(''),
  [COUPLE_ATTR.partner_b_last]: z.string().catch(''),
  [COUPLE_ATTR.partner_b_email]: optStr,
  category: optStr,
});

// ─── Exported TypeScript types ────────────────────────────────────────────────

export type PersonAttrs = z.infer<typeof PersonAttrsSchema>;
export type CompanyAttrs = z.infer<typeof CompanyAttrsSchema>;
export type VenueAttrs = z.infer<typeof VenueAttrsSchema>;
export type IndividualAttrs = z.infer<typeof IndividualAttrsSchema>;
export type CoupleAttrs = z.infer<typeof CoupleAttrsSchema>;

// ─── readEntityAttrs — typed overloads ───────────────────────────────────────

/**
 * Parse raw JSONB attributes into a fully typed struct for the given entity type.
 *
 * For UI server actions. Returns typed struct. Unknown keys are silently ignored.
 *
 * String fields are `string | null | undefined`:
 *   - `undefined` → key absent from JSONB
 *   - `null` → key explicitly set to null (e.g. cleared by patch_entity_attributes)
 *   - `string` → value present
 *
 * Boolean flags default to `false` when absent (safe sentinel value).
 * Display name fields (first_name, last_name) default to '' for callers that join with space.
 *
 * SECURITY: Never call `patch_entity_attributes` via the system client without an
 * explicit `owner_workspace_id` guard — this RPC has no inline ownership check and
 * relies on the caller using the session client (RLS-enforced).
 *
 * @example
 *   const attrs = readEntityAttrs(row.attributes, 'person');
 *   const phone = attrs.phone; // string | null | undefined — typed, no cast needed
 */
export function readEntityAttrs(raw: unknown, type: 'person'): PersonAttrs;
export function readEntityAttrs(raw: unknown, type: 'company'): CompanyAttrs;
export function readEntityAttrs(raw: unknown, type: 'venue'): VenueAttrs;
export function readEntityAttrs(raw: unknown, type: 'individual'): IndividualAttrs;
export function readEntityAttrs(raw: unknown, type: 'couple'): CoupleAttrs;
export function readEntityAttrs(
  raw: unknown,
  type: 'person' | 'company' | 'venue' | 'individual' | 'couple'
): PersonAttrs | CompanyAttrs | VenueAttrs | IndividualAttrs | CoupleAttrs {
  const input = raw != null && typeof raw === 'object' ? raw : {};
  switch (type) {
    case 'person':
      return PersonAttrsSchema.parse(input);
    case 'company':
      return CompanyAttrsSchema.parse(input);
    case 'venue':
      return VenueAttrsSchema.parse(input);
    case 'individual':
      return IndividualAttrsSchema.parse(input);
    case 'couple':
      return CoupleAttrsSchema.parse(input);
  }
}

// ─── toIONContext — flat context for LLM injection ────────────────────────────

/**
 * Keys that must never appear in Aion context output.
 *
 * - Ghost protocol sentinels (is_ghost, is_claimed, created_by_org_id, claimed_by_user_id)
 *   are internal bookkeeping — not meaningful context for the LLM.
 * - wifi_credentials is a security-sensitive credential — never emit to LLM context.
 *
 * Extend this set before any new credential or internal sentinel is added to attributes.
 */
const SENTINEL_KEYS = new Set([
  'is_ghost',
  'is_claimed',
  'created_by_org_id',
  'claimed_by_user_id',
  'wifi_credentials',
]);

/**
 * Build a flat `Record<string, string>` from raw entity attributes for Aion agent
 * context injection.
 *
 * For Aion agent context building. Returns all non-null attributes as flat strings.
 * Do not use `readEntityAttrs` for LLM context — this function preserves unknown keys
 * that readEntityAttrs would drop.
 *
 * Algorithm:
 *   1. Call `readEntityAttrs` to emit all known fields with their canonical key names.
 *      Sentinel keys (ghost flags, credentials) are filtered out before emitting.
 *   2. Then iterate `Object.entries(raw)` for any remaining keys not yet emitted —
 *      includes Scout-written fields and future extensions not yet codified in constants.
 *   3. JSON-stringify any value that is not a string/number/boolean — raw objects
 *      serialize as `[object Object]` in LLM context.
 *   4. Filter out null, undefined, empty string, and SENTINEL_KEYS.
 *
 * SECURITY: Never call `patch_entity_attributes` via the system client without an
 * explicit `owner_workspace_id` guard — this RPC has no inline ownership check and
 * relies on the caller using the session client (RLS-enforced).
 */
export function toIONContext(
  raw: unknown,
  type: 'person' | 'company' | 'venue' | 'individual' | 'couple'
): Record<string, string> {
  const result: Record<string, string> = {};

  function emitValue(k: string, v: unknown): void {
    if (SENTINEL_KEYS.has(k)) return;
    if (v === null || v === undefined || v === '') return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      result[k] = String(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // Strip sentinel sub-keys before stringifying — e.g. wifi_credentials inside venue_ops
      const filtered = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(([sk]) => !SENTINEL_KEYS.has(sk))
      );
      if (Object.keys(filtered).length > 0) {
        result[k] = JSON.stringify(filtered);
      }
    } else {
      result[k] = JSON.stringify(v);
    }
  }

  // Step 1: emit all known fields via the typed accessor
  const parsed = readEntityAttrs(raw, type as Parameters<typeof readEntityAttrs>[1]);
  for (const [k, v] of Object.entries(parsed)) {
    emitValue(k, v);
  }

  // Step 2: emit remaining unknown keys from the raw JSONB (Scout-written, future keys, etc.)
  const emitted = new Set(Object.keys(result));
  if (raw != null && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (emitted.has(k)) continue;
      emitValue(k, v);
    }
  }

  return result;
}
