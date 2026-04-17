/**
 * Metric → domain lookup.
 *
 * Drives layout-aware insight-row ordering in the Today's Brief card. Each
 * card declares one or more domains it reports against; the brief's fetcher
 * unions the active layout's card domains into `activeDomains`, then stable-
 * sorts insights so rows whose trigger-domain is in that set come first.
 *
 * Array-valued — many cards are legitimately cross-domain (`action_queue`,
 * `activity_feed`, `event_roi_snapshot`). The v1 voting rule: if ANY domain
 * a card declares is in the active-layout's domain set, the card votes its
 * whole domain set. Simple and permissive; measure and iterate.
 *
 * v1 stores the mapping in a central map rather than per-entry on the
 * registry — 55 edits vs. 1 file, and this file is also the auditable
 * source of truth for "which cards count as what domain" when taxonomy
 * questions arise (e.g. "is `finance.revenue_by_lead_source` sales or
 * finance?"). A future pass may migrate domains onto each registry entry
 * via the `domain?: Domain[]` field already present in `MetricBase`.
 *
 * See docs/reference/sales-brief-v2-design.md §6.4, §20 decision 11.
 *
 * @module shared/lib/metrics/domains
 */

import type { Domain } from './types';

/**
 * v1 domain assignments. Not exhaustive — anything not listed defaults to
 * `['meta']` at the lookup site, which maps to "no domain vote" and stays
 * visible in the brief regardless of layout.
 *
 * Cross-domain cards (sales + finance, production + finance, etc.) vote
 * their full set per the permissive v1 rule.
 */
export const METRIC_DOMAINS: Record<string, Domain[]> = {
  // ── Finance-schema metrics ─────────────────────────────────────────────
  'finance.revenue_collected':       ['sales', 'finance'],
  'finance.qbo_variance':            ['finance'],
  'finance.qbo_sync_health':         ['finance'],
  'finance.revenue_yoy':             ['sales', 'finance'],
  'finance.unreconciled_payments':   ['finance'],
  'finance.invoice_variance':        ['finance'],
  'finance.sales_tax_worksheet':     ['finance'],
  'finance.revenue_by_lead_source':  ['sales', 'finance'],
  'finance.budget_vs_actual':        ['finance'],
  'finance.ar_aged_60plus':          ['finance'],

  // ── Ops-schema metrics ─────────────────────────────────────────────────
  'ops.aion_refusal_rate':    ['meta'],
  'ops.crew_utilization':     ['crew'],
  'ops.settlement_variance':  ['production', 'finance'],
  'ops.vendor_payment_status':['finance'],
  'ops.multi_stop_rollup':    ['production'],

  // ── Lobby cards: finance ───────────────────────────────────────────────
  'lobby.financial_pulse':    ['finance'],
  'lobby.revenue_trend':      ['sales', 'finance'],
  'lobby.payment_health':     ['finance'],
  'lobby.settlement_tracking':['production', 'finance'],
  'lobby.vendor_payment_status':['finance'],

  // ── Lobby cards: sales ─────────────────────────────────────────────────
  'lobby.client_concentration':['sales'],
  'lobby.deal_pipeline':      ['sales'],
  'lobby.pipeline_velocity':  ['sales'],
  'lobby.passive_pipeline_feed':['sales'],
  'lobby.owed_today':         ['sales'],
  'lobby.awaiting_signature': ['sales'],
  'lobby.gone_quiet':         ['sales'],
  'lobby.weekly_tally':       ['sales'],
  'lobby.action_stream':      ['sales'],
  'lobby.network':            ['sales'],
  'lobby.network_detail':     ['sales'],
  'lobby.network_stream':     ['sales'],

  // ── Lobby cards: production ────────────────────────────────────────────
  'lobby.live_gig_monitor':   ['production'],
  'lobby.active_production':  ['production'],
  'lobby.real_time_logistics':['production'],
  'lobby.production_timeline':['production'],
  'lobby.run_of_show':        ['production'],
  'lobby.run_of_show_feed':   ['production'],
  'lobby.multi_stop_rollup':  ['production'],

  // ── Lobby cards: ops (schedule / calendar spanning domains) ────────────
  'lobby.today_schedule':     ['ops'],
  'lobby.week_strip':         ['ops'],
  'lobby.this_week':          ['ops'],

  // ── Lobby cards: cross-domain (sales × production) ─────────────────────
  'lobby.event_roi_snapshot': ['sales', 'production', 'finance'],
  'lobby.event_type_dist':    ['sales', 'production'],
  'lobby.event_dashboard':    ['sales', 'production'],

  // ── Lobby cards: meta / utility / cross-cutting ────────────────────────
  'lobby.urgency_strip':          ['meta'],
  'lobby.action_queue':           ['sales', 'production', 'crew', 'ops'],
  'lobby.todays_brief':           ['meta'],
  'lobby.activity_feed':          ['meta'],
  'lobby.global_pulse':           ['meta'],
  'lobby.sentiment_pulse':        ['meta'],
  'lobby.org_dashboard':          ['meta'],
  'lobby.onboarding':             ['meta'],
  'lobby.passkey_nudge_banner':   ['meta'],
  'lobby.recovery_backup_prompt': ['meta'],
  'lobby.design_showcase':        ['meta'],
  'lobby.pinned_answers':         ['meta'],
};

/** Look up domain(s) for a metric id. Unknown ids default to `['meta']`. */
export function domainsFor(metricId: string): Domain[] {
  return METRIC_DOMAINS[metricId] ?? ['meta'];
}

/**
 * Given the set of cardIds on the active layout, compute the aggregate
 * `activeDomains` set used by the brief reorder pass. Empty cardIds
 * (Default preset's legacy bento) returns the full non-meta domain set
 * — "rank everything equally." See §6.4.
 */
export function activeDomainsFor(cardIds: readonly string[]): Set<Domain> {
  if (cardIds.length === 0) {
    return new Set<Domain>(['sales', 'finance', 'production', 'crew', 'ops']);
  }
  const set = new Set<Domain>();
  for (const id of cardIds) {
    for (const d of domainsFor(id)) {
      set.add(d);
    }
  }
  return set;
}
