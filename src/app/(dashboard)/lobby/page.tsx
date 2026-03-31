'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { AnimatePresence, motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  M3_FADE_THROUGH_ENTER,
  M3_FADE_THROUGH_EXIT,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';
import { getDashboardData } from '@/widgets/dashboard/api';
import type { DashboardData } from '@/widgets/dashboard/api';
import { UrgencyStrip } from '@/widgets/urgency-strip';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { ChatInterface } from '@/app/(dashboard)/(features)/brain/components/ChatInterface';

// ── Page ───────────────────────────────────────────────────────────────────

/**
 * Unusonic Hub (Lobby) — Temporal Hierarchy Dashboard.
 * Single ambient backdrop, urgency strip at top, bento grid below.
 * Chat view toggles via session viewState.
 */
export default function LobbyPage() {
  const { viewState, setViewState } = useSession();
  const showOverview = viewState !== 'chat';

  const [dashboardData, setDashboardData] = useState<DashboardData | undefined>();
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getDashboardData();
        setDashboardData(data);
      } catch (err) {
        console.error('[lobby] failed to load dashboard data:', err);
      }
    });
  }, []);

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
                    transition: {
                      staggerChildren: M3_STAGGER_CHILDREN,
                      delayChildren: M3_STAGGER_DELAY,
                    },
                  },
                  hidden: {},
                  exit: {
                    opacity: 0,
                    transition: M3_FADE_THROUGH_EXIT,
                  },
                }}
              >
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
            transition={M3_FADE_THROUGH_ENTER}
          >
            <StagePanel className="flex-1 overflow-hidden flex flex-col !p-0">
              <div className="flex-1">
                <ChatInterface />
              </div>
            </StagePanel>

            <motion.button
              type="button"
              onClick={() => setViewState('overview')}
              transition={M3_FADE_THROUGH_ENTER}
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
