'use server';

import { getUrgencyAlerts } from './get-urgency-alerts';
import { getActionQueue } from './get-action-queue';
import { getTodaySchedule } from './get-today-schedule';
import { getWeekEvents } from './get-week-events';
import { getDealPipeline } from './get-deal-pipeline';
import { getFinancialPulse } from './get-financial-pulse';
import { getActivityFeed } from './get-activity-feed';
import { getRevenueTrend } from './get-revenue-trend';
import { getEventTypeDistribution } from './get-event-type-dist';
import { getClientConcentration } from './get-client-concentration';
import { getQboVariance } from '@/widgets/qbo-variance/api/get-qbo-variance';
import { getAionRefusalRate } from '@/widgets/aion-refusal-rate/api/get-aion-refusal-rate';
// Phase 5.1 — touring coordinator widgets.
import { getCrewUtilization } from '@/widgets/crew-utilization/api/get-crew-utilization';
import { getRevenueYoy } from '@/widgets/revenue-yoy/api/get-revenue-yoy';
import { getSettlementTracking } from '@/widgets/settlement-tracking/api/get-settlement-tracking';
import { getVendorPaymentStatus } from '@/widgets/vendor-payment-status/api/get-vendor-payment-status';
import { getMultiStopRollup } from '@/widgets/multi-stop-rollup/api/get-multi-stop-rollup';

import type { UrgencyAlert } from './get-urgency-alerts';
import type { QboVarianceDTO } from '@/widgets/qbo-variance/api/get-qbo-variance';
import type { AionRefusalRateDTO } from '@/widgets/aion-refusal-rate/api/get-aion-refusal-rate';
import type { CrewUtilizationDTO } from '@/widgets/crew-utilization/api/get-crew-utilization';
import type { RevenueYoyDTO } from '@/widgets/revenue-yoy/api/get-revenue-yoy';
import type { SettlementTrackingDTO } from '@/widgets/settlement-tracking/api/get-settlement-tracking';
import type { VendorPaymentStatusDTO } from '@/widgets/vendor-payment-status/api/get-vendor-payment-status';
import type { MultiStopRollupDTO } from '@/widgets/multi-stop-rollup/api/get-multi-stop-rollup';
import type { ActionItem as ActionQueueItem } from './get-action-queue';
import type { TodayScheduleResult } from './get-today-schedule';
import type { WeekDay } from './get-week-events';
import type { DealPipelineDTO } from './get-deal-pipeline';
import type { FinancialPulseDTO } from './get-financial-pulse';
import type { ActivityItem } from './get-activity-feed';
import type { RevenueTrendData } from './get-revenue-trend';
import type { EventTypeDistData } from './get-event-type-dist';
import type { ClientConcentrationData } from './get-client-concentration';

// ── Types ──────────────────────────────────────────────────────────────────

export type DashboardData = {
  alerts: UrgencyAlert[];
  actions: ActionQueueItem[];
  today: TodayScheduleResult;
  week: WeekDay[];
  pipeline: DealPipelineDTO;
  finance: FinancialPulseDTO;
  activity: ActivityItem[];
  revenueTrend: RevenueTrendData;
  eventTypes: EventTypeDistData;
  clientConcentration: ClientConcentrationData;
  /** Null when the caller lacks the `finance:reconcile` capability. */
  qboVariance: QboVarianceDTO | null;
  /** Null when the caller lacks the `workspace:owner` capability. Phase 3.4. */
  aionRefusalRate: AionRefusalRateDTO | null;
  // Phase 5.1 — touring coordinator widgets. Null when the viewer lacks the
  // required capability; the renderer hides the card in that case.
  crewUtilization: CrewUtilizationDTO | null;
  revenueYoy: RevenueYoyDTO | null;
  settlementTracking: SettlementTrackingDTO | null;
  vendorPaymentStatus: VendorPaymentStatusDTO | null;
  multiStopRollup: MultiStopRollupDTO | null;
};

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Optional Phase 2.4 plumbing: when a global Lobby time-range is active, the
 * caller can pass inclusive YYYY-MM-DD bounds here. Fetchers that honor them
 * (financial pulse, revenue trend) use the bounds; fetchers that don't (all-time
 * distributions, live schedules, activity feed) ignore them.
 *
 * Callers that omit this keep the legacy hardcoded windows. This preserves
 * backward compatibility per the Phase 2.4 constraint.
 */
export interface DashboardDataPeriod {
  periodStart: string;
  periodEnd: string;
}

/**
 * Single entry point for the lobby/dashboard page.
 * Calls all data sources in parallel and returns a unified DTO.
 */
export async function getDashboardData(period?: DashboardDataPeriod): Promise<DashboardData> {
  const [
    alerts,
    actions,
    today,
    week,
    pipeline,
    finance,
    activity,
    revenueTrend,
    eventTypes,
    clientConcentration,
    qboVariance,
    aionRefusalRate,
    crewUtilization,
    revenueYoy,
    settlementTracking,
    vendorPaymentStatus,
    multiStopRollup,
  ] = await Promise.all([
    getUrgencyAlerts(),
    getActionQueue(),
    getTodaySchedule(),
    getWeekEvents(),
    getDealPipeline(),
    getFinancialPulse(period),
    getActivityFeed(),
    getRevenueTrend(period),
    getEventTypeDistribution(),
    getClientConcentration(),
    // Phase 1.4 — gated on `finance:reconcile` inside the fetcher.
    getQboVariance(),
    // Phase 3.4 — gated on `workspace:owner` inside the fetcher.
    getAionRefusalRate(),
    // Phase 5.1 — touring coordinator set. Each fetcher gates on its own
    // capability and returns null when the caller is unqualified.
    getCrewUtilization(),
    getRevenueYoy(),
    getSettlementTracking(),
    getVendorPaymentStatus(),
    getMultiStopRollup(),
  ]);

  return {
    alerts,
    actions,
    today,
    week,
    pipeline,
    finance,
    activity,
    revenueTrend,
    eventTypes,
    clientConcentration,
    qboVariance,
    aionRefusalRate,
    crewUtilization,
    revenueYoy,
    settlementTracking,
    vendorPaymentStatus,
    multiStopRollup,
  };
}
