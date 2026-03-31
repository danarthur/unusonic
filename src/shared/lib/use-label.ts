/**
 * Density-aware label vocabulary.
 *
 * Labels shift from conversational (spacious) to terse (balanced) to silkscreen (dense).
 * The same data, different context. Use this for all section headers and field labels
 * that should adapt to the user's density preference.
 *
 * Usage:
 *   const density = useDensityStore(s => s.density);
 *   const label = useLabel('pipeline', density);
 *   // spacious: "Your pipeline"  balanced: "Pipeline"  dense: "PIPELINE"
 */

import { type DensityTier } from '@/shared/ui/layout/density-store';

const LABELS: Record<string, Record<DensityTier, string>> = {
  // ── CRM / Productions ──
  productions:    { spacious: 'Your productions',     balanced: 'Productions',     dense: 'PRODUCTIONS' },
  deal:           { spacious: 'Deal details',          balanced: 'Deal',            dense: 'DEAL' },
  pipeline:       { spacious: 'Deal pipeline',         balanced: 'Pipeline',        dense: 'PIPELINE' },
  signals:        { spacious: 'Deal signals',          balanced: 'Signals',         dense: 'SIGNALS' },
  notes:          { spacious: 'Notes',                 balanced: 'Notes',           dense: 'NOTES' },
  next_actions:   { spacious: 'Next actions',          balanced: 'Next actions',    dense: 'ACTIONS' },
  production_team:{ spacious: 'Production team',       balanced: 'Team',            dense: 'TEAM' },
  contract:       { spacious: 'Contract',              balanced: 'Contract',        dense: 'CONTRACT' },

  // ── Deal fields ──
  client:         { spacious: 'Client',                balanced: 'Client',          dense: 'CLIENT' },
  venue:          { spacious: 'Venue',                 balanced: 'Venue',           dense: 'VENUE' },
  owner:          { spacious: 'Owner',                 balanced: 'Owner',           dense: 'OWNER' },
  planner:        { spacious: 'Planner',               balanced: 'Planner',         dense: 'PLANNER' },
  event_type:     { spacious: 'Event type',            balanced: 'Type',            dense: 'TYPE' },
  event_date:     { spacious: 'Event date',            balanced: 'Date',            dense: 'DATE' },
  budget:         { spacious: 'Budget estimate',       balanced: 'Budget',          dense: 'BUDGET' },
  lead_source:    { spacious: 'Lead source',           balanced: 'Source',          dense: 'SOURCE' },
  referred_by:    { spacious: 'Referred by',           balanced: 'Referrer',        dense: 'REF' },
  win_probability:{ spacious: 'Win probability',       balanced: 'Win prob.',       dense: 'WIN%' },
  days_out:       { spacious: 'Days out',              balanced: 'Days out',        dense: 'DAYS' },

  // ── Financial ──
  revenue_mtd:    { spacious: 'Revenue this month',    balanced: 'Revenue MTD',     dense: 'REV MTD' },
  outstanding:    { spacious: 'Outstanding invoices',  balanced: 'Outstanding',     dense: 'OUTSTANDING' },
  total_revenue:  { spacious: 'Total revenue',         balanced: 'Revenue',         dense: 'REVENUE' },
  estimated_cost: { spacious: 'Estimated cost',        balanced: 'Est. cost',       dense: 'EST COST' },
  projected_margin:{ spacious: 'Projected margin',     balanced: 'Margin',          dense: 'MARGIN' },
  cash:           { spacious: 'Cash position',         balanced: 'Cash position',   dense: 'CASH' },
  incoming:       { spacious: 'Incoming (30 days)',    balanced: 'Incoming (30d)',  dense: 'IN 30D' },
  outgoing:       { spacious: 'Outgoing (30 days)',    balanced: 'Outgoing (30d)',  dense: 'OUT 30D' },

  // ── Events / Shows ──
  upcoming:       { spacious: 'Upcoming shows',        balanced: 'Upcoming',        dense: 'UPCOMING' },
  call_time:      { spacious: 'Call time',             balanced: 'Call time',       dense: 'CT' },
  load_in:        { spacious: 'Load-in',               balanced: 'Load-in',         dense: 'LOAD' },
  doors:          { spacious: 'Doors',                 balanced: 'Doors',           dense: 'DOORS' },
  show_time:      { spacious: 'Show time',             balanced: 'Show',            dense: 'SHOW' },

  // ── Network ──
  contacts:       { spacious: 'Your contacts',         balanced: 'Contacts',        dense: 'CONTACTS' },
  crew:           { spacious: 'Crew',                  balanced: 'Crew',            dense: 'CREW' },
  vendors:        { spacious: 'Vendors',               balanced: 'Vendors',         dense: 'VENDORS' },

  // ── General ──
  activity:       { spacious: 'Recent activity',       balanced: 'Activity',        dense: 'ACTIVITY' },
  search:         { spacious: 'Search productions',    balanced: 'Search',          dense: 'SEARCH' },
};

/**
 * Get a density-aware label. Falls back to the key itself if not found.
 * At dense tier, labels are already uppercase in the vocabulary — the CSS
 * `text-transform: uppercase` via `--stage-label-transform` doubles as a fallback.
 */
export function useLabel(key: string, density: DensityTier): string {
  return LABELS[key]?.[density] ?? key;
}
