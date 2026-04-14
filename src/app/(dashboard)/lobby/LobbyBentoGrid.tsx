'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { DashboardData } from '@/widgets/dashboard/api';
import { TodayScheduleWidget } from '@/widgets/today-schedule';
import { WeekStripWidget } from '@/widgets/week-strip';
import { ActionQueueWidget } from '@/widgets/action-queue';
import { DealPipelineWidget } from '@/widgets/deal-pipeline';
import { FinancialPulseWidget } from '@/widgets/financial-pulse';
import { ActivityFeedWidget } from '@/widgets/activity-feed';
import { RevenueTrendWidget } from '@/widgets/revenue-trend';
import { EventTypeDistWidget } from '@/widgets/event-type-dist';
import { ClientConcentrationWidget } from '@/widgets/client-concentration';
import { QboVarianceWidget } from '@/widgets/qbo-variance';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
  STAGE_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

// ── Animation helpers ─────────────────────────────────────────────────────

const gridVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGE_STAGGER_CHILDREN,
      delayChildren: STAGE_STAGGER_DELAY,
    },
  },
};

const cellVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

// ── Props ─────────────────────────────────────────────────────────────────

interface LobbyBentoGridProps {
  dashboardData?: DashboardData;
}

// ── Grid ──────────────────────────────────────────────────────────────────

/**
 * Temporal-hierarchy Bento Grid.
 * Single responsive layout — no state branching.
 *
 * Desktop (lg): 4-column grid with explicit row placement
 *   Row 1: Today (2) | This Week (1) | Action Queue (1)
 *   Row 2: Deal Pipeline (2) | Financial Pulse (2)
 *   Row 3: Activity Feed (1) | Revenue Trend (1) | Event Types (1) | Clients (1)
 *
 * Cards stretch to fill row height (align-items: stretch).
 * Content areas use flex-1 to expand — lists show more items,
 * charts grow taller. No dead space inside or between cards.
 *
 * Tablet (md): 2-column, natural stacking
 * Mobile: 1-column, Action Queue first
 */
export function LobbyBentoGrid({ dashboardData }: LobbyBentoGridProps) {
  return (
    <motion.div
      className="stage-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      initial="hidden"
      animate="visible"
      variants={gridVariants}
    >
      {/* ── Row 1: Now → This Week → Action Queue ──────────────
       * Max 320px on desktop — lists scroll internally.
       * Mobile: uncapped (stacked, no row-height contention).
       * ──────────────────────────────────────────────────────── */}

      {/* Action Queue — surfaces first on mobile, third on desktop */}
      <motion.div
        className="order-1 md:order-3 lg:order-3 lg:col-span-1 lg:max-h-80"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <ActionQueueWidget
          data={dashboardData?.actions ?? []}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Today's Schedule — hero cell, 2-col wide */}
      <motion.div
        className="order-2 md:order-1 lg:order-1 lg:col-span-2 lg:max-h-80"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <TodayScheduleWidget
          data={dashboardData?.today ?? { events: [], nextEvent: null }}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Week Strip — compact 7-day overview */}
      <motion.div
        className="order-3 md:order-2 lg:order-2 lg:col-span-1 lg:max-h-80"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <WeekStripWidget
          data={dashboardData?.week ?? []}
          loading={!dashboardData}
        />
      </motion.div>

      {/* ── Row 2: Pipeline + Financial Pulse ──────────────────── */}

      {/* Deal Pipeline — 2-col wide */}
      <motion.div
        className="order-4 lg:col-span-2"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <DealPipelineWidget
          data={dashboardData?.pipeline}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Financial Pulse — 2-col wide */}
      <motion.div
        className="order-5 lg:col-span-2"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <FinancialPulseWidget
          data={dashboardData?.finance}
          loading={!dashboardData}
        />
      </motion.div>

      {/* ── Row 3: Activity + Trends ───────────────────────────
       * Max 360px — Activity Feed scrolls, charts get breathing room.
       * ──────────────────────────────────────────────────────── */}

      {/* Activity Feed */}
      <motion.div
        className="order-6 lg:col-span-1 lg:max-h-[360px]"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <ActivityFeedWidget
          data={dashboardData?.activity ?? []}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Revenue Trend */}
      <motion.div
        className="order-7 lg:col-span-1 lg:max-h-[360px]"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <RevenueTrendWidget
          data={dashboardData?.revenueTrend ?? { months: [] }}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Event Type Distribution */}
      <motion.div
        className="order-8 lg:col-span-1 lg:max-h-[360px]"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <EventTypeDistWidget
          data={dashboardData?.eventTypes ?? { types: [] }}
          loading={!dashboardData}
        />
      </motion.div>

      {/* Client Concentration */}
      <motion.div
        className="order-9 lg:col-span-1 lg:max-h-[360px]"
        variants={cellVariants}
        transition={STAGE_MEDIUM}
      >
        <ClientConcentrationWidget
          data={dashboardData?.clientConcentration ?? { clients: [] }}
          loading={!dashboardData}
        />
      </motion.div>

      {/* QBO variance — Phase 1.4, finance-admin/owner only.
       * Hidden entirely when the fetcher returned null (capability denied).
       * Rendered with a loading state until dashboardData resolves, so admins
       * see the skeleton rather than a layout flash. */}
      {(!dashboardData || dashboardData.qboVariance !== null) && (
        <motion.div
          className="order-10 lg:col-span-1 lg:max-h-[360px]"
          variants={cellVariants}
          transition={STAGE_MEDIUM}
        >
          <QboVarianceWidget
            data={dashboardData?.qboVariance ?? undefined}
            loading={!dashboardData}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
