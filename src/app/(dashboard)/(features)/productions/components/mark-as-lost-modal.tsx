'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
import type { LostReason } from '../actions/get-deal';

const LOST_REASONS: { value: LostReason; label: string; description: string }[] = [
  { value: 'budget',       label: 'Budget',       description: 'Could not afford it' },
  { value: 'competitor',   label: 'Competitor',   description: 'Went with another company' },
  { value: 'cancelled',    label: 'Cancelled',    description: 'Show cancelled entirely' },
  { value: 'no_response',  label: 'No response',  description: 'Client went silent' },
  { value: 'scope',        label: 'Scope',        description: 'Outside what you offer' },
  { value: 'timing',       label: 'Timing',       description: 'Already booked that date' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: LostReason, competitorName: string | null) => Promise<void>;
};

export function MarkAsLostModal({ open, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<LostReason | null>(null);
  const [competitorName, setCompetitorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason) return;
    setSubmitting(true);
    await onConfirm(reason, reason === 'competitor' ? (competitorName.trim() || null) : null);
    setSubmitting(false);
    setReason(null);
    setCompetitorName('');
  };

  const handleClose = () => {
    if (submitting) return;
    setReason(null);
    setCompetitorName('');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Mark as lost"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 stage-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={handleClose}
          />

          <motion.div
            className="relative z-10 w-full max-w-sm"
            data-surface="raised"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={STAGE_HEAVY}
          >
            <StagePanel className="p-6 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)] flex flex-col gap-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="stage-label mb-1">Deal outcome</p>
                  <h2 className="text-[var(--stage-text-primary)] font-medium tracking-tight text-lg leading-none">Why was this lost?</h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  aria-label="Close"
                >
                  <X size={16} strokeWidth={1.5} aria-hidden />
                </button>
              </div>

              {/* Reason chips */}
              <div className="grid grid-cols-2 gap-2">
                {LOST_REASONS.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReason(value)}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                      reason === value
                        ? 'border-[var(--color-unusonic-error)]/60 bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)]'
                        : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] hover:border-[oklch(1_0_0_/_0.20)] stage-hover overflow-hidden text-[var(--stage-text-secondary)]'
                    )}
                  >
                    <span className={cn('text-sm font-medium tracking-tight', reason === value ? 'text-[var(--color-unusonic-error)]' : 'text-[var(--stage-text-primary)]')}>
                      {label}
                    </span>
                    <span className="text-field-label leading-snug text-[var(--stage-text-secondary)]">{description}</span>
                  </button>
                ))}
              </div>

              {/* Competitor name — only when 'competitor' is selected */}
              <AnimatePresence>
                {reason === 'competitor' && (
                  <motion.div
                    key="competitor-input"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={STAGE_HEAVY}
                    className="overflow-hidden"
                  >
                    <label className="block stage-label mb-1.5">
                      Which company? (optional)
                    </label>
                    <input
                      type="text"
                      value={competitorName}
                      onChange={(e) => setCompetitorName(e.target.value)}
                      placeholder="e.g. Pinnacle Productions"
                      autoFocus
                      className="w-full rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-[oklch(1_0_0_/_0.10)] py-2.5 text-sm font-medium text-[var(--stage-text-secondary)] stage-hover overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!reason || submitting}
                  className="flex-1 rounded-xl border border-[var(--color-unusonic-error)]/40 bg-[var(--color-unusonic-error)]/10 py-2.5 text-sm font-medium text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-unusonic-error)]/60 disabled:opacity-45 disabled:pointer-events-none"
                >
                  {submitting ? 'Marking lost…' : 'Mark as lost'}
                </button>
              </div>
            </StagePanel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
