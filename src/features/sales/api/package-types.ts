/**
 * Catalog package type definitions and pure utility functions.
 * No server directive — safe to import in both server and client contexts.
 * @module features/sales/api/package-types
 */

/**
 * Categories are defined by BILLING BEHAVIOR, not just labels.
 * Package: container for other items.
 * Service (Labor): sold by time (hours/days). Creates a crew slot.
 * Talent: sold by performance (flat rate). Creates a talent booking slot.
 * Rental (Gear): tracks stock/quantity. e.g. Chairs, Lights.
 * Retail/Sale (Consumable): consumed/sold. e.g. Sparklers, Gaffer Tape.
 * Fee: pure money. e.g. Travel Fee, Admin Fee.
 */
export type PackageCategory =
  | 'package'
  | 'service'
  | 'rental'
  | 'talent'
  | 'retail_sale'
  | 'fee';

/**
 * Canonical crew requirement unit. Flows from catalog definition → proposal line item → ops.crew_assignments.
 * One RequiredRole with quantity > 1 produces N assignment rows (each with its own quantity_index).
 */
export interface RequiredRole {
  /** Crew assignment role label (e.g. "Lighting Tech", "DJ", "A1 Audio"). */
  role: string;
  /** Discriminator: 'labor' = hourly/day-rate slot; 'talent' = flat-fee booking. Drives Flight Check display. */
  booking_type: 'labor' | 'talent';
  /** How many of this role are needed. Default 1. quantity > 1 → N assignment rows. */
  quantity: number;
  /** Default pay rate in dollars. Flat amount or hourly rate depending on pay model. */
  default_rate?: number | null;
  /** Default scheduled hours. Used when pay model = hourly. */
  default_hours?: number | null;
  /** Billing floor in hours. Industry standard minimum: 4. */
  minimum_hours?: number | null;
  /** Overtime rate in dollars. Applied after overtime_threshold hours. Null = no overtime. */
  overtime_rate?: number | null;
  /** Hours after which overtime_rate kicks in. Default 8 if overtime_rate is set. */
  overtime_threshold?: number | null;
  /** Default call time in "HH:MM" 24h format, e.g. "16:00". Written to call_time_override at handover. */
  default_call_time?: string | null;
  /** Optional preferred staff: directory.entities.id (Ghost Protocol — may not have an account yet). */
  entity_id?: string | null;
  /** Display name for the preferred staff member above. */
  assignee_name?: string | null;
  /** When true, this specific person was requested by the client and should not be swapped without approval. */
  client_locked?: boolean;
}

/**
 * Estimated cost for a single RequiredRole slot.
 * For talent (flat fee): rate × quantity (hours ignored).
 * For labor (hourly): rate × max(scheduled, minimum) × quantity.
 * Use this everywhere a crew cost estimate is needed — do not inline the formula.
 */
export function estimatedRoleCost(r: RequiredRole): number {
  const rate = r.default_rate ?? 0;
  const scheduled = r.default_hours ?? 0;
  const minimum = r.minimum_hours ?? 0;
  const billableHours = Math.max(scheduled, minimum);
  const qty = Math.max(1, r.quantity ?? 1);
  if (r.booking_type === 'talent') return rate * qty;
  if (r.overtime_rate != null && billableHours > (r.overtime_threshold ?? 8)) {
    const threshold = r.overtime_threshold ?? 8;
    return (rate * threshold + r.overtime_rate * (billableHours - threshold)) * qty;
  }
  return rate * billableHours * qty;
}

/**
 * Computes the overtime-aware cost breakdown for a labor role.
 * Returns { regularHours, overtimeHours, regularRate, overtimeRate, total }
 * so callers can display the split without re-implementing the formula.
 */
export function roleCostBreakdown(
  r: RequiredRole,
  billableHours: number,
  qty: number
): {
  regularHours: number;
  overtimeHours: number;
  regularRate: number;
  overtimeRate: number | null;
  total: number;
} {
  const rate = r.default_rate ?? 0;
  if (r.overtime_rate != null && billableHours > (r.overtime_threshold ?? 8)) {
    const threshold = r.overtime_threshold ?? 8;
    const regularHours = threshold;
    const overtimeHours = billableHours - threshold;
    const total = (rate * regularHours + r.overtime_rate * overtimeHours) * qty;
    return { regularHours, overtimeHours, regularRate: rate, overtimeRate: r.overtime_rate, total };
  }
  return { regularHours: billableHours, overtimeHours: 0, regularRate: rate, overtimeRate: null, total: rate * billableHours * qty };
}

/** Staffing requirement for Service packages (legacy). @deprecated Use required_roles[] instead. */
export interface PackageDefinitionStaffing {
  /** When true, booking this package will check calendar for staff with the given role. */
  required: boolean;
  /** Role required (e.g. DJ, Photographer, Security). Used for availability check. */
  role?: string | null;
  /** Optional: default/named talent (e.g. "DJ Allegra"). Specific staff member for this package. */
  defaultStaffId?: string | null;
  /** Display name for default staff when no staff table (e.g. "Allegra"). */
  defaultStaffName?: string | null;
}

/** Single catalog item in a package: one row on canvas with quantity. No nesting. */
export type LineItemPricingType = 'included' | 'itemized';

/** Modular package content (JSONB definition column). Container (name, price, category) stays in columns. */
export type PackageDefinitionBlock =
  | { id: string; type: 'header_hero'; content: { image?: string; title?: string } }
  | { id: string; type: 'line_item'; catalogId: string; quantity: number; pricing_type?: LineItemPricingType }
  | { id: string; type: 'line_item_group'; label: string; items: string[] }
  | { id: string; type: 'text_block'; content: string }
  | { id: string; type: string; content?: unknown };

/** Ingredient-specific fields (Service/Rental/Talent/Retail) stored in definition.ingredient_meta. */
export interface IngredientMeta {
  duration_hours?: number | null;
  /**
   * @deprecated Do not write. Read only during migration window.
   * Use definition.required_roles[] instead. Will be removed after Migration 3 Step 2 runs.
   */
  staff_role?: string | null;
  /** Canonical crew requirements for this item. Replaces staff_role. */
  required_roles?: RequiredRole[] | null;
  stock_quantity?: number | null;
  buffer_percent?: number | null;
  /**
   * @deprecated Do not write. contact_info is superseded by talent_entity_id.
   */
  contact_info?: string | null;
  /** Production department for pull sheet grouping (Rental only). e.g. Audio, Lighting, Video. */
  department?: string | null;
  /** Default call time for Labor items in "HH:MM" 24h format. */
  default_call_time?: string | null;
  /** Ghost Protocol: directory.entities.id for the associated talent performer. */
  talent_entity_id?: string | null;
  /** Display name for the talent performer (e.g. "DJ Allegra"). */
  talent_display_name?: string | null;
  performance_duration_minutes?: number | null;
  /** Number of performance sets (e.g. 2 for "2 x 45-min sets"). Default 1. */
  performance_set_count?: number | null;
  performance_notes?: string | null;
}

export interface PackageDefinition {
  layout?: string;
  blocks: PackageDefinitionBlock[];
  /**
   * @deprecated Do not write. Read only during migration window.
   * Use required_roles[] instead. Will be removed after Migration 4 Step 2 runs.
   */
  staffing?: PackageDefinitionStaffing | null;
  /**
   * Canonical crew requirements for this package (all categories including Labor items).
   * Replaces staffing (for bundles) and ingredient_meta.staff_role (for Labor/Service items).
   * All new writes go here. resolveRequiredRoles() normalizes all three data states.
   */
  required_roles?: RequiredRole[] | null;
  /** For non-package items: Service/Rental/Talent/Retail fields (duration, stock, contact, etc.). */
  ingredient_meta?: IngredientMeta | null;
}

/**
 * Computes the total estimated cost of a bundle package from its ingredient costs and required roles.
 * For bundles, target_cost is always computed — never manually set.
 * If any ingredient has a null target_cost, it is treated as 0 (see hasNullCosts helper).
 */
export function computeBundleTargetCost(
  ingredients: Array<{ target_cost: number | null; blockQuantity: number }>,
  requiredRoles: RequiredRole[]
): number {
  const ingredientCost = ingredients.reduce(
    (sum, i) => sum + (i.target_cost ?? 0) * i.blockQuantity,
    0
  );
  const roleCost = requiredRoles.reduce((sum, r) => sum + estimatedRoleCost(r), 0);
  return ingredientCost + roleCost;
}

/**
 * Resolves crew requirements from a package definition, handling all three data states:
 * 1. New format: definition.required_roles[] (post-backfill or new items)
 * 2. Legacy Labor path: definition.ingredient_meta.required_roles[] (pre-backfill)
 * 3. Legacy scalar fallback: ingredient_meta.staff_role or staffing.role (migration window)
 *
 * Use this everywhere you need crew roles from a package definition.
 * Do NOT read staff_role or staffing directly — always go through this resolver.
 */
export function resolveRequiredRoles(def: PackageDefinition | null | undefined): RequiredRole[] {
  if (!def) return [];
  // Canonical path (post-backfill or new items).
  // Only return if the array has actual roles — empty arrays fall through to legacy paths
  // so staff_role still works when required_roles was accidentally emptied.
  if (def.required_roles != null && def.required_roles.length > 0) return def.required_roles;
  // Ingredient path (Labor/Service items, pre-backfill).
  if (def.ingredient_meta?.required_roles != null && def.ingredient_meta.required_roles.length > 0) return def.ingredient_meta.required_roles;
  // Legacy scalar fallback — covers migration window until Migrations 3 + 4 Step 2 run
  const legacyRole = def.ingredient_meta?.staff_role ?? def.staffing?.role;
  if (legacyRole) {
    return [{
      role: legacyRole,
      booking_type: 'labor',
      quantity: 1,
      default_rate: null,
      default_hours: def.ingredient_meta?.duration_hours ?? null,
    }];
  }
  return [];
}
