/**
 * Tier configuration constants and helpers.
 * Source of truth for tier pricing, limits, and Aion mode in application code.
 * Mirrors the `public.tier_config` DB table.
 *
 * @module shared/lib/tier-config
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TierSlug = 'foundation' | 'growth' | 'studio';

export type AionMode = 'passive' | 'active' | 'autonomous';

export interface TierConfig {
  tier: TierSlug;
  label: string;
  basePriceCents: number;
  billingInterval: 'month';
  includedSeats: number;
  /** NULL means unlimited */
  maxActiveShows: number | null;
  extraSeatPriceCents: number;
  aionMode: AionMode;
  /** NULL means unlimited within mode */
  aionMonthlyActions: number | null;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<TierSlug, TierConfig> = {
  foundation: {
    tier: 'foundation',
    label: 'Foundation',
    basePriceCents: 3900,
    billingInterval: 'month',
    includedSeats: 2,
    maxActiveShows: 5,
    extraSeatPriceCents: 1500,
    aionMode: 'passive',
    aionMonthlyActions: null,
  },
  growth: {
    tier: 'growth',
    label: 'Growth',
    basePriceCents: 9900,
    billingInterval: 'month',
    includedSeats: 5,
    maxActiveShows: 25,
    extraSeatPriceCents: 1500,
    aionMode: 'active',
    aionMonthlyActions: null,
  },
  studio: {
    tier: 'studio',
    label: 'Studio',
    basePriceCents: 24900,
    billingInterval: 'month',
    includedSeats: 15,
    maxActiveShows: null,
    extraSeatPriceCents: 1200,
    aionMode: 'autonomous',
    aionMonthlyActions: 50,
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the full config object for a tier slug. */
export function getTierConfig(tier: TierSlug): TierConfig {
  return TIER_CONFIG[tier];
}

/** Number of seats included in the base price for this tier. */
export function getIncludedSeats(tier: TierSlug): number {
  return TIER_CONFIG[tier].includedSeats;
}

/** Maximum active shows for this tier, or null if unlimited. */
export function getMaxActiveShows(tier: TierSlug): number | null {
  return TIER_CONFIG[tier].maxActiveShows;
}

/** Cost in cents for each extra seat beyond the included count. */
export function getExtraSeatPrice(tier: TierSlug): number {
  return TIER_CONFIG[tier].extraSeatPriceCents;
}

/** Aion capability level for this tier. */
export function getAionMode(tier: TierSlug): AionMode {
  return TIER_CONFIG[tier].aionMode;
}
