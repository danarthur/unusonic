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

import type { UrgencyAlert } from './get-urgency-alerts';
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
};

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Single entry point for the lobby/dashboard page.
 * Calls all data sources in parallel and returns a unified DTO.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [alerts, actions, today, week, pipeline, finance, activity, revenueTrend, eventTypes, clientConcentration] =
    await Promise.all([
      getUrgencyAlerts(),
      getActionQueue(),
      getTodaySchedule(),
      getWeekEvents(),
      getDealPipeline(),
      getFinancialPulse(),
      getActivityFeed(),
      getRevenueTrend(),
      getEventTypeDistribution(),
      getClientConcentration(),
    ]);

  return { alerts, actions, today, week, pipeline, finance, activity, revenueTrend, eventTypes, clientConcentration };
}
