'use client';

/**
 * Maps a registry metric ID to a React component for the modular Lobby.
 *
 * Phase 2.2 of reports & analytics. The map covers every widget-kind entry
 * in `src/shared/lib/metrics/registry.ts` plus the single RPC-backed widget
 * with a `widgetKey` (qbo-variance). RPC-backed metrics WITHOUT a widgetKey
 * (e.g. `finance.revenue_collected`) are rendered by Phase 3.1's
 * `analytics_result` card, not here — they're skipped by `renderLobbyCard`
 * with an explicit comment so a future reader knows where the gap is.
 *
 * Why not dynamic `import('@/widgets/' + key)`: per the implementation plan,
 * Next 16 + webpack tree-shakes a static map cleanly, while a string-glob
 * dynamic import pulls every widget folder into the route bundle. The map
 * also gives us a single grep-able place to see the widget surface area.
 *
 * @module app/(dashboard)/lobby/lobby-card-renderer
 */

import React from 'react';
import type { DashboardData } from '@/widgets/dashboard/api';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isWidgetMetric } from '@/shared/lib/metrics/types';

// Currently-wired widgets (already consumed by the legacy LobbyBentoGrid).
import { ActionQueueWidget } from '@/widgets/action-queue';
import { TodayScheduleWidget } from '@/widgets/today-schedule';
import { WeekStripWidget } from '@/widgets/week-strip';
import { DealPipelineWidget } from '@/widgets/deal-pipeline';
import { FinancialPulseWidget } from '@/widgets/financial-pulse';
import { ActivityFeedWidget } from '@/widgets/activity-feed';
import { RevenueTrendWidget } from '@/widgets/revenue-trend';
import { EventTypeDistWidget } from '@/widgets/event-type-dist';
import { ClientConcentrationWidget } from '@/widgets/client-concentration';
import { QboVarianceWidget } from '@/widgets/qbo-variance';
import { AionRefusalRateWidget } from '@/widgets/aion-refusal-rate';
// Phase 5.1 — touring coordinator set.
import { CrewUtilizationWidget } from '@/widgets/crew-utilization';
import { RevenueYoyWidget } from '@/widgets/revenue-yoy';
import { SettlementTrackingWidget } from '@/widgets/settlement-tracking';
import { VendorPaymentStatusWidget } from '@/widgets/vendor-payment-status';
import { MultiStopRollupWidget } from '@/widgets/multi-stop-rollup';

// Self-fetching widgets / banners.
import { ActiveProductionWidget } from '@/widgets/active-production';
import { OwedTodayWidget } from '@/widgets/owed-today';
import { ThisWeekWidget } from '@/widgets/this-week';
import { TodaysBriefWidget } from '@/widgets/todays-brief';
import { AwaitingSignatureWidget } from '@/widgets/awaiting-signature';
import { GoneQuietWidget } from '@/widgets/gone-quiet';
import { WeeklyTallyWidget } from '@/widgets/weekly-tally';
import { RealTimeLogisticsWidget } from '@/widgets/real-time-logistics';
import { PaymentHealthWidget } from '@/widgets/payment-health';
import { RunOfShowFeedWidget } from '@/widgets/run-of-show-feed';
import { PasskeyNudgeBanner } from '@/widgets/passkey-nudge-banner';

// ─── Renderer contract ──────────────────────────────────────────────────────

type RendererInput = {
  dashboardData?: DashboardData;
  loading: boolean;
  /**
   * The active layout's ordered card IDs, or `undefined` for the legacy
   * default bento (where the preset has no explicit cardIds list).
   *
   * Phase 2 commit 2 (Sales Brief v2): TodaysBriefWidget reads this to
   * compute the active domain set for layout-aware insight-row reordering.
   * Other widgets ignore it today; the field is optional to keep the
   * renderer surface narrow.
   */
  activeCardIds?: readonly string[];
};

type LobbyCardRenderer = (input: RendererInput) => React.ReactElement | null;

/**
 * Static map of registry IDs that have a Lobby renderer in Phase 2.2.
 * Anything missing is either:
 *  - an RPC-backed scalar/table metric without a widgetKey (Phase 3.1 owns it), or
 *  - a widget that needs more context than the Lobby provides
 *    (e.g. production-timeline needs an event), in which case
 *    `renderLobbyCard` returns a small placeholder.
 */
const RENDERERS: Record<string, LobbyCardRenderer> = {
  // Fed by dashboardData -----------------------------------------------------
  'lobby.action_queue': ({ dashboardData, loading }) => (
    <ActionQueueWidget data={dashboardData?.actions ?? []} loading={loading} />
  ),
  'lobby.today_schedule': ({ dashboardData, loading }) => (
    <TodayScheduleWidget
      data={dashboardData?.today ?? { events: [], nextEvent: null }}
      loading={loading}
    />
  ),
  'lobby.week_strip': ({ dashboardData, loading }) => (
    <WeekStripWidget data={dashboardData?.week ?? []} loading={loading} />
  ),
  'lobby.deal_pipeline': ({ dashboardData, loading }) => (
    <DealPipelineWidget data={dashboardData?.pipeline} loading={loading} />
  ),
  'lobby.financial_pulse': ({ dashboardData, loading }) => (
    <FinancialPulseWidget data={dashboardData?.finance} loading={loading} />
  ),
  'lobby.activity_feed': ({ dashboardData, loading }) => (
    <ActivityFeedWidget data={dashboardData?.activity ?? []} loading={loading} />
  ),
  'lobby.revenue_trend': ({ dashboardData, loading }) => (
    <RevenueTrendWidget
      data={dashboardData?.revenueTrend ?? { months: [] }}
      loading={loading}
    />
  ),
  'lobby.event_type_dist': ({ dashboardData, loading }) => (
    <EventTypeDistWidget
      data={dashboardData?.eventTypes ?? { types: [] }}
      loading={loading}
    />
  ),
  'lobby.client_concentration': ({ dashboardData, loading }) => (
    <ClientConcentrationWidget
      data={dashboardData?.clientConcentration ?? { clients: [] }}
      loading={loading}
    />
  ),
  // Sole RPC-backed metric with a widgetKey today.
  'finance.qbo_variance': ({ dashboardData, loading }) => {
    // Hide the card entirely when the fetcher returned null (capability denied).
    if (dashboardData && dashboardData.qboVariance === null) return null;
    return (
      <QboVarianceWidget
        data={dashboardData?.qboVariance ?? undefined}
        loading={loading}
      />
    );
  },

  // Self-fetching widgets / banners ------------------------------------------
  'lobby.todays_brief': ({ activeCardIds }) => (
    <TodaysBriefWidget activeCardIds={activeCardIds} />
  ),
  'lobby.owed_today': () => <OwedTodayWidget />,
  'lobby.this_week': () => <ThisWeekWidget />,
  'lobby.awaiting_signature': () => <AwaitingSignatureWidget />,
  'lobby.gone_quiet': () => <GoneQuietWidget />,
  'lobby.weekly_tally': () => <WeeklyTallyWidget />,
  'lobby.active_production': () => <ActiveProductionWidget />,
  'lobby.real_time_logistics': () => <RealTimeLogisticsWidget />,
  'lobby.payment_health': () => <PaymentHealthWidget />,
  'lobby.run_of_show_feed': () => <RunOfShowFeedWidget />,
  'lobby.passkey_nudge_banner': () => <PasskeyNudgeBanner />,

  // Phase 3.4 — owner-only refusal rate. RPC-backed scalar with widgetKey.
  'ops.aion_refusal_rate': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.aionRefusalRate === null) return null;
    return (
      <AionRefusalRateWidget
        data={dashboardData?.aionRefusalRate ?? undefined}
        loading={loading}
      />
    );
  },

  // Phase 5.1 — touring coordinator set ---------------------------------------
  // Scalar widgets ride on the RPC metric IDs (no separate widget registry
  // entry needed). Table-backed widgets use lobby.* IDs defined in the
  // registry. Each fetcher gates on its own capability and returns null when
  // the viewer cannot see the card; here we hide the cell in that case.
  'ops.crew_utilization': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.crewUtilization === null) return null;
    return (
      <CrewUtilizationWidget
        data={dashboardData?.crewUtilization ?? undefined}
        loading={loading}
      />
    );
  },
  'finance.revenue_yoy': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.revenueYoy === null) return null;
    return (
      <RevenueYoyWidget
        data={dashboardData?.revenueYoy ?? undefined}
        loading={loading}
      />
    );
  },
  'lobby.settlement_tracking': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.settlementTracking === null) return null;
    return (
      <SettlementTrackingWidget
        data={dashboardData?.settlementTracking ?? undefined}
        loading={loading}
      />
    );
  },
  'lobby.vendor_payment_status': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.vendorPaymentStatus === null) return null;
    return (
      <VendorPaymentStatusWidget
        data={dashboardData?.vendorPaymentStatus ?? undefined}
        loading={loading}
      />
    );
  },
  'lobby.multi_stop_rollup': ({ dashboardData, loading }) => {
    if (dashboardData && dashboardData.multiStopRollup === null) return null;
    return (
      <MultiStopRollupWidget
        data={dashboardData?.multiStopRollup ?? undefined}
        loading={loading}
      />
    );
  },
};

/**
 * Resolves a registry ID to a rendered card. Returns `null` for entries that
 * do not have a Phase 2.2 renderer; the caller should skip null cells so the
 * grid stays visually clean. Phase 2.3 will surface these as "Coming soon"
 * library entries instead of silently dropping them.
 */
export function renderLobbyCard(
  cardId: string,
  input: RendererInput,
): React.ReactElement | null {
  const def = METRICS[cardId];
  if (!def) return null;

  const renderer = RENDERERS[cardId];
  if (renderer) return renderer(input);

  // RPC-backed scalar/table metric with no widgetKey: Phase 3.1's
  // analytics_result card renders these. Skip on the Lobby for now.
  if (!isWidgetMetric(def) && !('widgetKey' in def && def.widgetKey)) {
    return null;
  }

  // Widget-kind entry with no current renderer (e.g. production-timeline,
  // network-stream). These need richer context (an event, a person, etc.)
  // that the Lobby does not provide. Phase 2.5+ will wire fetchers.
  return null;
}

/** True when a given registry ID has a Lobby renderer wired in Phase 2.2. */
export function hasLobbyRenderer(cardId: string): boolean {
  return cardId in RENDERERS;
}
