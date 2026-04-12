#!/usr/bin/env tsx
/**
 * CI check: tier_config TS constant vs DB rows consistency.
 *
 * The TS constant (src/shared/lib/tier-config.ts) drives client-side display.
 * The DB table (public.tier_config) drives webhook tier resolution.
 * If they disagree on non-Stripe fields (label, base_price, seats, shows,
 * aion_mode, aion_monthly_actions), the user sees one thing on the plan page
 * but gets billed for another.
 *
 * Stripe price IDs are env-specific and excluded from the check — they're
 * populated per-environment via env vars and a seed script.
 *
 * Usage: npx tsx scripts/check-tier-config-consistency.ts
 * CI: runs in quality job, fails build on mismatch.
 *
 * @module scripts/check-tier-config-consistency
 */

// Import the TS constant
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TIER_CONFIG_MODULE_PATH = '../src/shared/lib/tier-config';

async function main() {
  // Dynamic import to handle the module resolution
  let TIER_CONFIG: Record<string, {
    label: string;
    basePrice: number;
    includedSeats: number;
    maxActiveShows: number | null;
    aionMode: string;
    aionMonthlyActions: number | null;
  }>;

  try {
    const mod = await import(TIER_CONFIG_MODULE_PATH);
    TIER_CONFIG = mod.TIER_CONFIG ?? mod.default?.TIER_CONFIG;
    if (!TIER_CONFIG) {
      console.error('Could not import TIER_CONFIG from tier-config.ts');
      process.exit(1);
    }
  } catch (e) {
    console.error('Failed to import tier-config.ts:', e);
    process.exit(1);
  }

  // The DB values are known from the migration (we check them at build time
  // without a DB connection by hardcoding the expected DB state).
  // If the DB migration changes, this file must be updated to match.
  const DB_TIERS: Record<string, {
    label: string;
    base_price_cents: number;
    included_seats: number;
    max_active_shows: number | null;
    aion_mode: string;
    aion_monthly_actions: number | null;
  }> = {
    foundation: {
      label: 'Foundation',
      base_price_cents: 3900,
      included_seats: 2,
      max_active_shows: 5,
      aion_mode: 'passive',
      aion_monthly_actions: null,
    },
    growth: {
      label: 'Growth',
      base_price_cents: 9900,
      included_seats: 5,
      max_active_shows: 25,
      aion_mode: 'active',
      aion_monthly_actions: null,
    },
    studio: {
      label: 'Studio',
      base_price_cents: 24900,
      included_seats: 15,
      max_active_shows: null,
      aion_mode: 'autonomous',
      aion_monthly_actions: 50,
    },
  };

  let hasError = false;

  for (const [tier, dbRow] of Object.entries(DB_TIERS)) {
    const tsRow = TIER_CONFIG[tier];
    if (!tsRow) {
      console.error(`MISMATCH: tier "${tier}" exists in DB but not in TS constant`);
      hasError = true;
      continue;
    }

    const checks: Array<[string, unknown, unknown]> = [
      ['label', tsRow.label, dbRow.label],
      ['basePrice (cents)', tsRow.basePrice, dbRow.base_price_cents],
      ['includedSeats', tsRow.includedSeats, dbRow.included_seats],
      ['maxActiveShows', tsRow.maxActiveShows, dbRow.max_active_shows],
      ['aionMode', tsRow.aionMode, dbRow.aion_mode],
      ['aionMonthlyActions', tsRow.aionMonthlyActions, dbRow.aion_monthly_actions],
    ];

    for (const [field, tsVal, dbVal] of checks) {
      if (tsVal !== dbVal) {
        console.error(`MISMATCH [${tier}.${field}]: TS=${JSON.stringify(tsVal)} DB=${JSON.stringify(dbVal)}`);
        hasError = true;
      }
    }
  }

  // Check for TS tiers not in DB
  for (const tier of Object.keys(TIER_CONFIG)) {
    if (!DB_TIERS[tier]) {
      console.error(`MISMATCH: tier "${tier}" exists in TS constant but not in DB`);
      hasError = true;
    }
  }

  if (hasError) {
    console.error('\ntier_config consistency check FAILED. Update the TS constant or DB migration to match.');
    process.exit(1);
  }

  console.log('tier_config consistency check passed: TS constant and DB rows agree.');
}

main();
