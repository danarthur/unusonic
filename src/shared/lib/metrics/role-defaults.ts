import type { MetricRole } from './types';

/**
 * Hand-curated default Lobby card ordering per persona. Drawn from the
 * role-default spec at docs/reference/pages/reports-role-defaults-spec.md.
 * The card_ids must match registry IDs verbatim.
 *
 * Order matters — the array order is the bento order top-to-bottom.
 *
 * If a card a default lists requires a capability the viewer does not hold,
 * library.getRoleDefaults() drops it before the Lobby renders. The viewer
 * sees a smaller-than-default set, which is acceptable.
 */
export const ROLE_DEFAULTS: Record<MetricRole, string[]> = {
  owner: [
    'lobby.financial_pulse',
    'finance.revenue_collected',
    'finance.ar_aged_60plus',
    'lobby.week_strip',
    'lobby.active_production',
    'lobby.deal_pipeline',
    'lobby.action_queue',
    // Phase 5.1 — crew utilization added at the 8th slot. Swapped in for
    // client_concentration, which was a low-click default in early analytics
    // and is still available to owners via the Phase 2.3 library picker.
    'ops.crew_utilization',
  ],
  pm: [
    'lobby.today_schedule',
    'lobby.week_strip',
    'lobby.real_time_logistics',
    'lobby.action_queue',
    'lobby.production_timeline',
    'lobby.active_production',
    'lobby.urgency_strip',
    'lobby.network_stream',
  ],
  finance_admin: [
    'finance.qbo_sync_health',
    'finance.qbo_variance',
    'finance.ar_aged_60plus',
    'finance.unreconciled_payments',
    'lobby.payment_health',
    'finance.revenue_collected',
    'finance.invoice_variance',
    'lobby.action_queue',
  ],
  touring_coordinator: [
    'lobby.urgency_strip',
    'lobby.today_schedule',
    'lobby.action_queue',
    // Phase 5.1 — settlement + vendor payments are the top-of-mind questions
    // for a touring coordinator at 11pm post-load-out. Promoted above
    // logistics so money visibility lands above the fold.
    'lobby.settlement_tracking',
    'lobby.vendor_payment_status',
    'lobby.real_time_logistics',
    'lobby.production_timeline',
    // Phase 5.1 — replaces lobby.week_strip with the tour-specific next-markets
    // rollup (the week strip's generic "events in 7 days" shape doesn't
    // answer "which markets haven't been advanced yet"). active_production
    // and run_of_show_feed drop from defaults but remain library-accessible.
    'lobby.multi_stop_rollup',
  ],
  employee: [
    'lobby.action_queue',
    'lobby.run_of_show_feed',
    'lobby.passkey_nudge_banner',
  ],
};

/** Hard cap on the number of cards a user can have on their Lobby. */
export const LOBBY_CARD_CAP = 12;
