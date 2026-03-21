'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { HandoffWizard } from './handoff-wizard';
import type { DealDetail } from '../actions/get-deal';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

type FrostedPlanLensProps = {
  dealId: string;
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  /** Called when the handoff wizard completes successfully (after handoverDeal resolves). Prism uses this to refetch and transition to PlanLens. */
  onHandoverSuccess: (eventId: string) => void;
};

export function FrostedPlanLens({
  dealId,
  deal,
  stakeholders,
  onHandoverSuccess,
}: FrostedPlanLensProps) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SIGNAL_PHYSICS}
        className="relative flex flex-col items-center justify-center min-h-[280px] rounded-[28px] overflow-hidden liquid-card p-8 border border-white/10"
      >
        {/* Frosted overlay — blurred so the lock reads as locked */}
        <div
          className="absolute inset-0 bg-obsidian/70 backdrop-blur-xl pointer-events-none border border-white/5"
          aria-hidden
        />
        <div className="relative z-10 flex flex-col items-center gap-8 text-center">
          <div className="p-5 rounded-2xl liquid-panel-nested border border-white/10 shadow-inner">
            <Lock size={32} className="text-ink-muted" aria-hidden />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-ceramic font-medium tracking-tight leading-none">
              This event has not been handed over yet.
            </p>
            <p className="text-sm text-mercury leading-relaxed">
              Hand over to production to unlock run of show, crewing, and logistics.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={() => setWizardOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="bg-obsidian text-ceramic px-6 py-3 rounded-full liquid-levitation flex items-center gap-2 transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
          >
            Hand over to production
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {wizardOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-obsidian/60 backdrop-blur-sm"
              aria-hidden
              onClick={() => setWizardOpen(false)}
            />
            <HandoffWizard
              dealId={dealId}
              deal={deal}
              stakeholders={stakeholders}
              onSuccess={onHandoverSuccess}
              onDismiss={() => setWizardOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
