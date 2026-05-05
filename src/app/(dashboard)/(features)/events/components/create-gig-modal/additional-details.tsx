'use client';

/**
 * AdditionalDetails — collapsed-by-default disclosure on stage 2 of the
 * create-gig modal.
 *
 * Holds rough-budget, internal notes, and the lead-source selector. Kept
 * collapsed because most inquiries are typed in fast and these fields are
 * rarely-but-often: visible enough to find, hidden enough to not slow the
 * common path.
 *
 * Takes the LeadSourceSelector as a child node rather than threading its
 * many props through this component — keeps the surface narrow and avoids
 * coupling this disclosure to the lead-source data shape.
 */

import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { CurrencyInput } from '@/shared/ui/currency-input';

export interface AdditionalDetailsProps {
  expanded: boolean;
  setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  budgetEstimatedDisplay: string;
  setBudgetEstimated: (v: number | undefined) => void;
  notes: string;
  setNotes: (v: string) => void;
  /** Pre-built LeadSourceSelector — passed in to avoid threading 14 props. */
  leadSourceSelector: ReactNode;
}

export function AdditionalDetails({
  expanded,
  setExpanded,
  budgetEstimatedDisplay,
  setBudgetEstimated,
  notes,
  setNotes,
  leadSourceSelector,
}: AdditionalDetailsProps) {
  return (
    <div className="border-t border-[oklch(1_0_0_/_0.04)] pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between stage-label text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
        aria-expanded={expanded}
      >
        <span>Additional details</span>
        <ChevronDown
          size={12}
          className={cn('transition-transform duration-[80ms]', expanded && 'rotate-180')}
          strokeWidth={1.5}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="additional"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <div className="pt-3 flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
              <div>
                <label htmlFor="create-gig-budget" className="block stage-label mb-1.5">Rough budget</label>
                <CurrencyInput
                  id="create-gig-budget"
                  value={budgetEstimatedDisplay}
                  onChange={(v) => setBudgetEstimated(v === '' ? undefined : Number(v))}
                  placeholder="25,000"
                  step={100}
                  align="left"
                />
              </div>
              <div>
                <label className="block stage-label mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes…"
                  rows={2}
                  className="stage-input w-full min-w-0 py-2.5 min-h-[calc(var(--stage-input-height,34px)*2)] resize-none"
                />
              </div>
              {leadSourceSelector}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
