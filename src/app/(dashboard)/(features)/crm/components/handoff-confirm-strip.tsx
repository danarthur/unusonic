'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, MapPin, Building2 } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { handoverDeal } from '../actions/handover-deal';
import { toast } from 'sonner';
import type { DealDetail } from '../actions/get-deal';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

type HandoffConfirmStripProps = {
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  onSuccess: (eventId: string) => void;
};

export function HandoffConfirmStrip({
  deal,
  stakeholders,
  onSuccess,
}: HandoffConfirmStripProps) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  // Pre-filled from deal data
  const venue = stakeholders.find((s) => s.role === 'venue_contact');
  const client = stakeholders.find((s) => s.role === 'bill_to');
  const dateFormatted = deal.proposed_date
    ? new Date(deal.proposed_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No date set';

  // Only allow handoff for signed/deposit stages
  const canHandoff = ['contract_signed', 'deposit_received'].includes(deal.status);

  if (!canHandoff) return null;

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={STAGE_LIGHT}
      >
        <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[var(--color-unusonic-success)]/30 bg-[var(--color-unusonic-success)]/5">
          <p className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
            Handed over to production
          </p>
        </StagePanel>
      </motion.div>
    );
  }

  const handleHandoff = () => {
    startTransition(async () => {
      const result = await handoverDeal(deal.id);
      if (result.success) {
        setDone(true);
        onSuccess(result.eventId);
      } else {
        toast.error(result.error ?? 'Failed to hand over deal');
      }
    });
  };

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
        Ready to hand over
      </h3>

      {/* Pre-filled summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-tight bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]">
          <Calendar size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
          {dateFormatted}
        </span>
        {venue && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-tight bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]">
            <MapPin size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
            {venue.name}
          </span>
        )}
        {client && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-tight bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]">
            <Building2 size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
            {client.name}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleHandoff}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors hover:bg-[var(--stage-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-60"
      >
        {isPending ? (
          'Creating show...'
        ) : (
          <>
            Create show
            <ArrowRight size={14} strokeWidth={1.5} />
          </>
        )}
      </button>
    </StagePanel>
  );
}
