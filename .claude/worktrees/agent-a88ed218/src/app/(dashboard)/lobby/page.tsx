'use client';

import React from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { AnimatePresence, motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import {
  M3_FADE_THROUGH_ENTER,
  M3_FADE_THROUGH_EXIT,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';
import { usePulseMetrics } from '@/widgets/global-pulse';
import { GlobalPulseStrip } from '@/widgets/global-pulse';
import { LobbyBentoGrid } from './LobbyBentoGrid';
import { ChatInterface } from '@/app/(dashboard)/(features)/brain/components/ChatInterface';

/**
 * Signal Hub (Lobby) — Living Topology Bento Grid.
 * Growth: Pipeline + Action Stream + Inbox + Cash Flow.
 * Execution: Live Gig + Run-of-Show + Sentiment Pulse.
 * Levitation: Live Gig floats (scale, shadow) when 15–60 min to showtime.
 * Critical: Focus Layout (Hero 60%, secondary column).
 * Bokeh: Background blurs when a card is focused.
 */
export default function LobbyPage() {
  const { viewState, setViewState } = useSession();
  const { isActiveMode } = usePulseMetrics();
  const showOverview = viewState !== 'chat';

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col font-sans relative">
      {/* Ambient state tint — cool (Growth) vs warm (Execution); single gradient from top, no orbs */}
      {showOverview && (
        <div className="absolute inset-0 z-0" aria-hidden>
          <div className={isActiveMode ? 'lobby-ambient-execution' : 'lobby-ambient-growth'} />
        </div>
      )}
      <AnimatePresence mode="wait">
        {showOverview && (
          <>
            {/* Pulse bar overlays scroll; scroll content fades at top so content above bar disappears, glass reads */}
            <div className="relative flex-1 min-h-0 flex flex-col">
              {/* Pulse strip — overlay so not masked; no bg so glass blurs content in fade zone */}
              <motion.div
                key="pulse-strip"
                className="absolute top-0 left-0 right-0 z-20 px-4 pt-4 md:px-6 md:pt-6 lg:px-8 lg:pt-8 pb-2 pointer-events-none"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: M3_FADE_THROUGH_EXIT }}
                transition={M3_FADE_THROUGH_ENTER}
              >
                <div className="pointer-events-auto">
                  <GlobalPulseStrip />
                </div>
              </motion.div>

              {/* Scroll area with top fade: content above the bar fades out so only glass effect shows */}
              <motion.div
                key="hub-view"
                className="relative z-10 flex-1 min-h-0 overflow-auto lobby-scroll-fade-top px-4 md:px-6 lg:px-8 pb-4 md:pb-6 lg:pb-8"
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
                    scale: 0.98,
                    transition: M3_FADE_THROUGH_EXIT,
                  },
                }}
              >
                <motion.div
                  className="flex flex-col gap-4 pt-[7.5rem]"
                  variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}
                >
                  <LobbyBentoGrid />
                </motion.div>
              </motion.div>
            </div>
          </>
        )}

        {viewState === 'chat' && (
          <motion.div
            key="chat-view"
            className="relative z-10 flex-1 min-h-0 w-full flex flex-col"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.99,
              y: -4,
              transition: M3_FADE_THROUGH_EXIT,
            }}
            transition={M3_FADE_THROUGH_ENTER}
          >
            <LiquidPanel className="flex-1 overflow-hidden flex flex-col !p-0">
              <div className="flex-1">
                <ChatInterface />
              </div>
            </LiquidPanel>

            <motion.button
              type="button"
              onClick={() => setViewState('overview')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={M3_FADE_THROUGH_ENTER}
              className="mt-4 mx-auto flex items-center gap-2 m3-btn-tonal text-xs uppercase tracking-widest"
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
              Return to Dashboard
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
