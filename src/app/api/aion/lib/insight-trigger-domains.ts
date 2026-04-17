/**
 * Insight `trigger_type` → domain mapping.
 *
 * Used by the brief's reorder pass (see docs/reference/sales-brief-v2-design.md
 * §6.4) to determine which insight rows rank up on which layouts. Kept as a
 * code-level const rather than a column on `cortex.aion_insights` because the
 * mapping is stable across workspaces and maintained alongside the evaluators
 * themselves.
 *
 * When adding a new evaluator, add its trigger_type here too — the reorder
 * pass defaults unknown triggers to `'meta'` (no domain vote, always visible).
 *
 * @module app/api/aion/lib/insight-trigger-domains
 */

import type { Domain } from '@/shared/lib/metrics/types';

export const INSIGHT_TRIGGER_DOMAINS: Record<string, Domain> = {
  // v1 evaluators (shipped in Phase 1)
  proposal_viewed_unsigned: 'sales',
  deal_stale:               'sales',
  crew_unconfirmed:         'crew',
  show_no_crew:             'production',

  // Phase 2 commit 3 evaluators (to be added alongside their modules)
  deposit_gap:              'sales',
  quote_expiring:           'sales',
  gone_quiet_with_value:    'sales',
  hot_lead_multi_view:      'sales',
};

/** Look up the domain for an insight trigger_type. Unknown → 'meta'. */
export function domainForTrigger(triggerType: string): Domain {
  return INSIGHT_TRIGGER_DOMAINS[triggerType] ?? 'meta';
}
