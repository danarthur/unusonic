'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { useLobbyTopology } from '@/widgets/global-pulse/lib/use-lobby-topology';
import { PipelineVelocityWidget } from '@/widgets/pipeline-velocity';
import { ActionStreamWidget } from '@/widgets/action-stream';
import { LiveGigMonitorWidget } from '@/widgets/live-gig-monitor';
import { RunOfShowFeedWidget } from '@/widgets/run-of-show-feed';
import { SentimentPulseWidget } from '@/widgets/sentiment-pulse';
import { CashFlowStream } from '@/app/(dashboard)/(features)/finance/components/CashFlowStream';
import { DailyBriefingClient } from '@/app/(dashboard)/(features)/inbox/components/DailyBriefingClient';
import { LobbyFocusProvider } from './LobbyFocusContext';
import { LobbyBentoCell } from './LobbyBentoCell';
import { ContextualCardDrawer } from './ContextualCardDrawer';
import {
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
  SIGNAL_PHYSICS,
} from '@/shared/lib/motion-constants';

/** Stub: ION-suggested contextual alert. Replace with API when ready. */
const STUB_CONTEXTUAL_ALERT = process.env.NODE_ENV === 'development'
  ? {
      id: 'weather-1',
      type: 'weather',
      title: 'Rain expected at doors',
      detail: 'Outdoor setup may need cover. Consider moving load-in earlier.',
      parentCardId: 'live-gig',
    }
  : null;

function BentoGridInner() {
  const { urgency, isFocusLayout, isLevitation } = useLobbyTopology();
  const [contextualAlert, setContextualAlert] = useState<typeof STUB_CONTEXTUAL_ALERT>(
    STUB_CONTEXTUAL_ALERT
  );

  const isActiveMode = urgency !== 'growth';

  // Focus Layout (Critical): Hero 60%, secondary column right
  if (isFocusLayout) {
    return (
      <motion.div
        key="focus"
        layout
        className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:grid-rows-[minmax(320px,1fr)_minmax(200px,auto)]"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: M3_STAGGER_CHILDREN, delayChildren: M3_STAGGER_DELAY },
          },
          hidden: {},
        }}
        transition={SIGNAL_PHYSICS}
      >
        <LobbyBentoCell id="live-gig" className="lg:col-span-3 lg:row-span-2 min-h-[320px] order-2 lg:order-1">
          <LiveGigMonitorWidget levitate />
          <ContextualCardDrawer
            alert={contextualAlert}
            onDismiss={() => setContextualAlert(null)}
          />
        </LobbyBentoCell>
        <LobbyBentoCell id="ros" className="lg:col-span-2 lg:row-span-1 min-h-[280px] order-1 lg:order-2">
          <RunOfShowFeedWidget />
        </LobbyBentoCell>
        <LobbyBentoCell id="sentiment" className="lg:col-span-2 min-h-[200px] order-3">
          <SentimentPulseWidget />
        </LobbyBentoCell>
      </motion.div>
    );
  }

  // Standard Execution (State B)
  if (isActiveMode) {
    return (
      <motion.div
        key={isLevitation ? 'levitation' : 'execution'}
        layout
        className="grid grid-cols-1 md:grid-cols-4 gap-4 md:grid-rows-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(200px,auto)]"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: M3_STAGGER_CHILDREN, delayChildren: M3_STAGGER_DELAY },
          },
          hidden: {},
        }}
        transition={SIGNAL_PHYSICS}
      >
        <LobbyBentoCell id="live-gig" className="md:col-span-2 md:row-span-2 min-h-[280px] order-2 md:order-1">
          <LiveGigMonitorWidget levitate={isLevitation} />
          <ContextualCardDrawer
            alert={contextualAlert}
            onDismiss={() => setContextualAlert(null)}
          />
        </LobbyBentoCell>
        <LobbyBentoCell id="ros" className="md:col-span-2 md:row-span-2 min-h-[280px] order-1 md:order-2">
          <RunOfShowFeedWidget />
        </LobbyBentoCell>
        <LobbyBentoCell id="sentiment" className="col-span-full min-h-[200px] order-3">
          <SentimentPulseWidget />
        </LobbyBentoCell>
      </motion.div>
    );
  }

  // Growth (State A)
  return (
    <motion.div
      key="growth"
      layout
      className="grid grid-cols-1 md:grid-cols-4 gap-4 md:grid-rows-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(200px,auto)]"
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: M3_STAGGER_CHILDREN, delayChildren: M3_STAGGER_DELAY },
        },
        hidden: {},
      }}
      transition={SIGNAL_PHYSICS}
    >
      <LobbyBentoCell id="pipeline" className="md:col-span-2 md:row-span-2 min-h-[280px] order-2 md:order-1">
        <PipelineVelocityWidget />
      </LobbyBentoCell>
      <LobbyBentoCell id="action-stream" className="md:col-span-2 md:row-span-2 min-h-[280px] order-1 md:order-2">
        <ActionStreamWidget />
      </LobbyBentoCell>
      <LobbyBentoCell id="inbox" className="md:col-span-2 min-h-[200px] order-3">
        <LiquidPanel className="h-full flex flex-col min-h-0 !p-4">
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight mb-3 shrink-0">
            Inbox
          </h2>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DailyBriefingClient items={[]} />
          </div>
        </LiquidPanel>
      </LobbyBentoCell>
      <LobbyBentoCell id="cash-flow" className="md:col-span-2 min-h-[200px] order-4">
        <CashFlowStream />
      </LobbyBentoCell>
    </motion.div>
  );
}

export function LobbyBentoGrid() {
  return (
    <LobbyFocusProvider>
      <BentoGridInner />
    </LobbyFocusProvider>
  );
}
