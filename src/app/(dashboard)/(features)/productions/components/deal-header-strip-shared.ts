/**
 * Shared types, constants, and pure helpers for the deal header strip.
 * Kept in a `.ts` (no JSX) file so it can be imported by both the main
 * strip and any sibling component without pulling in client-only deps.
 */

import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';
import type { DealClientContext } from '../actions/get-deal-client';
import type { DealDetail } from '../actions/get-deal';

// =============================================================================
// Public props for the parent component (re-exported via deal-header-strip.tsx)
// =============================================================================

export type DealHeaderStripProps = {
  // Scalars managed by DealLens
  title: string | null;
  proposedDate: string | null;
  eventArchetype: string | null;
  readOnly?: boolean;
  saving?: boolean;
  onTitleChange?: (value: string) => void;
  /** Save a scalar field change (date, archetype, budget). Pickers are now owned by the header strip. */
  onSaveScalar?: (patch: {
    proposed_date?: string | null;
    event_archetype?: string | null;
    budget_estimated?: number | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
  }) => void;
  // Stakeholders (client, venue, owner, planner)
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  client: DealClientContext | null;
  sourceOrgId: string | null;
  onStakeholdersChange: () => void;
};

// =============================================================================
// Field-on-surface class constants
// =============================================================================

/** Label sitting above each value (Date, Owner, etc.) */
export const FIELD_LABEL_CLASS =
  'stage-label text-[var(--stage-text-tertiary)] mb-1 select-none leading-none';

/** Empty-state value pill ("add", "—") */
export const EMPTY_VALUE_CLASS =
  'stage-field-label text-[var(--stage-text-tertiary)] flex items-center gap-1.5';

/** Padding wrapper for each field cell */
export const FIELD_BLOCK_CLASS = 'px-3 py-2.5 min-w-0';

/** Hover affordance applied to clickable field blocks */
export const FIELD_BLOCK_INTERACTIVE_CLASS =
  'cursor-pointer [border-radius:var(--stage-radius-input,6px)] hover:bg-[var(--stage-accent-muted)] transition-colors';

// =============================================================================
// Date formatter (locale-aware, parses yyyy-MM-dd as local)
// =============================================================================

/**
 * Format an ISO yyyy-MM-dd string for display. Parses as a local date so
 * Western timezones don't shift back a day (which `new Date('yyyy-MM-dd')`
 * would do — that's UTC midnight).
 */
export function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
