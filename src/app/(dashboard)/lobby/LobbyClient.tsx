'use client';

import React from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  STAGE_LIGHT,
  M3_FADE_THROUGH_EXIT,
} from '@/shared/lib/motion-constants';
import { UrgencyStrip } from '@/widgets/urgency-strip';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { ChatInterface } from '@/app/(dashboard)/(features)/aion/components/ChatInterface';
import { PlanPromptBanner } from './PlanPromptBanner';
import { dashboardQueries } from '@/widgets/dashboard/api/queries';
import type { DashboardData } from '@/widgets/dashboard/api';
import type { WorkspaceUsage } from '@/app/(dashboard)/settings/plan/actions';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import {
  LobbyTimeRangeProvider,
  useLobbyTimeRange,
} from './LobbyTimeRangeContext';
import { LobbyTimeRangePicker } from './LobbyTimeRangePicker';

// ── Props ──────────────────────────────────────────────────────────────────

interface LobbyClientProps {
  /**
   * Resolved Lobby card ordering for the current user. Present only when the
   * `reports.modular_lobby` feature flag is enabled on the workspace; absent
   * when the flag is off (the existing hard-coded layout is used instead).
   */
  cardIds?: string[];
  /**
   * True when the modular Lobby feature flag is enabled. Drives the
   * time-range picker visibility — we don't show the picker on legacy
   * Lobbies because no widget there respects the global range yet.
   */
  modularEnabled?: boolean;
}

// ── Chat view ─────────────────────────────────────────────────────────────

/**
 * Aion chat surface and "return to dashboard" affordance. Lifted out so the
 * top-level Lobby component stays under the cyclomatic-complexity ratchet.
 */
function ChatView({ onReturn }: { onReturn: () => void }) {
  return (
    <motion.div
      key="chat-view"
      className="relative z-10 flex-1 min-h-0 w-full flex flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: -4,
        transition: M3_FADE_THROUGH_EXIT,
      }}
      transition={STAGE_LIGHT}
    >
      <StagePanel className="flex-1 overflow-hidden flex flex-col !p-0">
        <div className="flex-1">
          <ChatInterface />
        </div>
      </StagePanel>

      <motion.button
        type="button"
        onClick={onReturn}
        transition={STAGE_LIGHT}
        className="mt-4 mx-auto flex items-center gap-2 stage-btn stage-btn-secondary text-xs uppercase tracking-widest"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75"
          />
        </svg>
        Return to dashboard
      </motion.button>
    </motion.div>
  );
}

// ── Overview view ─────────────────────────────────────────────────────────

type OverviewViewProps = {
  dashboardData: DashboardData | undefined;
  usage: WorkspaceUsage | null | undefined;
  cardIds?: string[];
  modularEnabled?: boolean;
};

/**
 * Hub-overview view — banners, urgency strip, and the bento grid. Lifted out
 * so the parent component stays under the cyclomatic-complexity ratchet.
 */
function OverviewView({ dashboardData, usage, cardIds, modularEnabled }: OverviewViewProps) {
  return (
    <motion.div
      key="hub-overview"
      className="relative flex-1 min-h-0 flex flex-col overflow-auto"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: M3_FADE_THROUGH_EXIT }}
    >
      <motion.div
        key="hub-view"
        className="flex flex-col gap-[var(--stage-gap,8px)] p-[var(--stage-padding,16px)]"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={{
          visible: {
            transition: { staggerChildren: 0.03 },
          },
          hidden: {},
          exit: {
            opacity: 0,
            transition: M3_FADE_THROUGH_EXIT,
          },
        }}
      >
        <PlanPromptBanner
          billingStatus={usage?.billingStatus}
          seatUsage={usage?.seatUsage}
          seatLimit={usage?.seatLimit}
          showUsage={usage?.showUsage}
          showLimit={usage?.showLimit}
        />
        <UrgencyStrip alerts={dashboardData?.alerts ?? []} />
        {modularEnabled && (
          <div className="flex justify-end">
            <LobbyTimeRangePicker />
          </div>
        )}
        <LobbyBentoGrid dashboardData={dashboardData} cardIds={cardIds} />
      </motion.div>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

/**
 * Unusonic Hub (Lobby) — Temporal Hierarchy Dashboard.
 * Single ambient backdrop, urgency strip at top, bento grid below.
 * Chat view toggles via session viewState.
 *
 * When `cardIds` is provided (modular Lobby feature flag ON), `LobbyBentoGrid`
 * renders exactly those cards in that order. Otherwise it falls back to the
 * legacy hard-coded layout — no visible difference for flag-off workspaces.
 */
export function LobbyClient(props: LobbyClientProps) {
  // The provider mounts unconditionally so context is always available, but
  // the picker only renders when modularEnabled. Picker-less mounts are
  // harmless: useLobbyTimeRange resolves to defaults, and consumers that
  // don't pass `period` to the dashboard query keep their legacy behavior.
  return (
    <LobbyTimeRangeProvider>
      <LobbyClientInner {...props} />
    </LobbyTimeRangeProvider>
  );
}

function LobbyClientInner({ cardIds, modularEnabled }: LobbyClientProps) {
  const { viewState, setViewState } = useSession();
  const { workspaceId } = useWorkspace();
  const { resolved } = useLobbyTimeRange();
  const showOverview = viewState !== 'chat';

  // Period is only threaded into the query when the modular Lobby is on —
  // otherwise we keep the legacy queryKey shape so existing cache entries
  // remain warm and behavior is byte-identical for unaffected workspaces.
  const period = modularEnabled
    ? { periodStart: resolved.start, periodEnd: resolved.end }
    : undefined;

  const { data: dashboardData } = useQuery({
    ...dashboardQueries.all(workspaceId ?? '', period),
    enabled: !!workspaceId,
  });
  const { data: usage } = useQuery({
    ...dashboardQueries.usage(workspaceId ?? ''),
    enabled: !!workspaceId,
  });

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col font-sans relative">
      {/* Ambient backdrop — single neutral gradient, no state branching */}
      {showOverview && (
        <div className="absolute inset-0 z-0" aria-hidden>
          <div className="lobby-ambient-growth" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {showOverview && (
          <OverviewView
            dashboardData={dashboardData}
            usage={usage}
            cardIds={cardIds}
            modularEnabled={modularEnabled}
          />
        )}

        {viewState === 'chat' && (
          <ChatView onReturn={() => setViewState('overview')} />
        )}
      </AnimatePresence>
    </div>
  );
}
