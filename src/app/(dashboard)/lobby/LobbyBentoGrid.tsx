'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
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
import { renderLobbyCard } from './lobby-card-renderer';
import { SortableLobbyCell } from './SortableLobbyCell';

// ── Bento sizing ──────────────────────────────────────────────────────────
//
// Cards that benefit from horizontal width (schedules, pipelines, trend
// charts, timelines) render as "hero" — 2 of 4 columns on lg. Everything
// else is "standard" — 1 of 4 columns. Creates the uneven bento rhythm the
// legacy layout had, applied to any preset or custom card ordering.

const HERO_WIDGET_KEYS = new Set<string>([
  'today-schedule',
  'deal-pipeline',
  'financial-pulse',
  'revenue-trend',
  'production-timeline',
  'real-time-logistics',
  'settlement-tracking',
  'vendor-payment-status',
  'multi-stop-rollup',
  'passive-pipeline-feed',
  'run-of-show-feed',
  'owed-today',
  'this-week',
  'todays-brief',
]);

function spanForCardId(cardId: string): 'hero' | 'standard' {
  // cardId is either a 'lobby.<snake>' or a scalar metric id. Map to a
  // widget key via the registry — falls back to 'standard' when unknown.
  // Kept inline so the grid doesn't import METRICS for a simple lookup; the
  // widget-key guess from the id is cheap and usually right.
  const snake = cardId.startsWith('lobby.')
    ? cardId.slice('lobby.'.length)
    : cardId.split('.').slice(-1)[0] ?? '';
  const kebab = snake.replace(/_/g, '-');
  return HERO_WIDGET_KEYS.has(kebab) ? 'hero' : 'standard';
}

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
  /**
   * Dispatch key: 'legacy' renders the frozen hand-coded bento (Default
   * preset), 'modular' renders the registry-backed grid (every other preset
   * and all customs). Driven by the active layout's rendererMode.
   */
  rendererMode: 'legacy' | 'modular';
  /**
   * Ordered registry IDs — required when `rendererMode === 'modular'`.
   * Ignored on the legacy path.
   */
  cardIds?: string[];
  /**
   * When true, the modular grid renders drag handles + remove affordances
   * on every cell. Ignored on the legacy path (Default is non-editable).
   */
  editMode?: boolean;
  /**
   * Called when the user reorders cards via drag-and-drop. The parent
   * reconciles the new order with the server.
   */
  onReorder?: (newOrder: string[]) => void;
  /**
   * Called when the user clicks the X on a card in edit mode.
   */
  onRemove?: (id: string) => void;
}

// Phase 2.3 manual smoke test checklist (drag mechanics aren't unit-tested
// because dnd-kit's testing surface is fragile in jsdom/happy-dom):
//   [ ] Toggle edit mode → handles + X buttons appear on every cell.
//   [ ] Drag a card down two slots → other cards shift into its old slot,
//       network round-trip fires saveLobbyLayout once.
//   [ ] Press Escape mid-drag → card returns to origin, no save fires.
//   [ ] Click X → card disappears optimistically, persists on next reload.
//   [ ] Resize viewport below 768px → controls hide entirely.
//   [ ] Reset layout → confirmation, then defaults reload.
//   [ ] Add card from drawer → appended to end, drawer stays open at <12.
//   [ ] Hit cap → Add button + drawer rows go disabled with tooltip.

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
/**
 * Modular Lobby path (Phase 2.2). Renders an ordered list of registry IDs
 * resolved by the page-level feature-flag check. Cards without a Phase 2.2
 * renderer are skipped silently — see lobby-card-renderer.
 */
function ModularBentoGrid({
  cardIds,
  dashboardData,
  editMode = false,
  onReorder,
  onRemove,
}: {
  cardIds: string[];
  dashboardData?: DashboardData;
  editMode?: boolean;
  onReorder?: (newOrder: string[]) => void;
  onRemove?: (id: string) => void;
}) {
  const loading = !dashboardData;
  const cells = cardIds
    .map((id) => ({ id, node: renderLobbyCard(id, { dashboardData, loading }) }))
    .filter((c): c is { id: string; node: React.ReactElement } => c.node !== null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIndex = cardIds.indexOf(String(active.id));
    const newIndex = cardIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder?.(arrayMove(cardIds, oldIndex, newIndex));
  };

  // Animation variants are skipped while editing so reordering springs read
  // as drag-driven motion rather than stagger-in motion.
  const sortableIds = cells.map((c) => c.id);

  const grid = (
    <motion.div
      className="stage-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      initial={editMode ? false : 'hidden'}
      animate="visible"
      variants={gridVariants}
    >
      {cells.map(({ id, node }) => (
        <motion.div
          key={id}
          className={
            spanForCardId(id) === 'hero'
              ? 'max-h-[360px] lg:col-span-2'
              : 'max-h-80 lg:col-span-1'
          }
          variants={cellVariants}
          transition={STAGE_MEDIUM}
        >
          <SortableLobbyCell
            id={id}
            editMode={editMode}
            onRemove={(removeId) => onRemove?.(removeId)}
          >
            {node}
          </SortableLobbyCell>
        </motion.div>
      ))}
    </motion.div>
  );

  // No DndContext when not editing — keeps the cell tree byte-cheap and
  // sidesteps any sensor activation surprises in view mode.
  if (!editMode) return grid;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Legacy hard-coded Lobby layout. Rendered when the modular Lobby flag is
 * OFF for the workspace — every card slot, every breakpoint behavior, and
 * every order-* class is preserved here so flag-off workspaces see no
 * visible change.
 */
function LegacyBentoGrid({ dashboardData }: { dashboardData?: DashboardData }) {
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
        className="order-1 md:order-3 lg:order-3 max-h-80 lg:col-span-1"
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
        className="order-2 md:order-1 lg:order-1 max-h-80 lg:col-span-2"
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
        className="order-3 md:order-2 lg:order-2 max-h-80 lg:col-span-1"
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
        className="order-6 max-h-[360px] lg:col-span-1"
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
        className="order-7 max-h-[360px] lg:col-span-1"
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
        className="order-8 max-h-[360px] lg:col-span-1"
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
        className="order-9 max-h-[360px] lg:col-span-1"
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
          className="order-10 max-h-[360px] lg:col-span-1"
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

export function LobbyBentoGrid({
  dashboardData,
  rendererMode,
  cardIds,
  editMode,
  onReorder,
  onRemove,
}: LobbyBentoGridProps) {
  if (rendererMode === 'legacy') {
    return <LegacyBentoGrid dashboardData={dashboardData} />;
  }
  return (
    <ModularBentoGrid
      cardIds={cardIds ?? []}
      dashboardData={dashboardData}
      editMode={editMode}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  );
}
