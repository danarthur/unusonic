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
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

// ── Page ───────────────────────────────────────────────────────────────────

/**
 * Unusonic Hub (Lobby) — Temporal Hierarchy Dashboard.
 * Single ambient backdrop, urgency strip at top, bento grid below.
 * Chat view toggles via session viewState.
 */
export default function LobbyPage() {
  const { viewState, setViewState } = useSession();
  const { workspaceId } = useWorkspace();
  const showOverview = viewState !== 'chat';

  const { data: dashboardData } = useQuery({
    ...dashboardQueries.all(workspaceId ?? ''),
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
                <LobbyBentoGrid dashboardData={dashboardData} />
              </motion.div>
          </motion.div>
        )}

        {viewState === 'chat' && (
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
              onClick={() => setViewState('overview')}
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
        )}
      </AnimatePresence>
    </div>
  );
}
