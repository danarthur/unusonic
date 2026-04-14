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
    'lobby.client_concentration',
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
    'lobby.real_time_logistics',
    'lobby.production_timeline',
    'lobby.active_production',
    'lobby.run_of_show_feed',
    'lobby.week_strip',
  ],
  employee: [
    'lobby.action_queue',
    'lobby.run_of_show_feed',
    'lobby.passkey_nudge_banner',
  ],
};

/** Hard cap on the number of cards a user can have on their Lobby. */
export const LOBBY_CARD_CAP = 12;
