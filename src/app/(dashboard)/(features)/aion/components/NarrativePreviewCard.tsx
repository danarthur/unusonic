'use client';

/**
 * Narrative preview + confirm card (Phase 3 §3.5 update_narrative).
 *
 * Shows the before/after diff of the deal narrative. Confirm upserts the
 * cortex.memory row via confirmAndWriteAionNarrative. Cancel marks the
 * aion_write_log row inert.
 */

import React, { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Check, X, FileText, AlertCircle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import {
  confirmAndWriteAionNarrative,
  cancelAionDraft,
} from '@/app/(dashboard)/(features)/aion/actions/write-confirmations';

export interface NarrativePreviewCardProps {
  draftId: string;
  previousNarrative: string | null;
  newNarrative: string;
  className?: string;
}

type Status = 'drafted' | 'writing' | 'written' | 'cancelled' | 'error';

export function NarrativePreviewCard({
  draftId,
  previousNarrative,
  newNarrative,
  className,
}: NarrativePreviewCardProps) {
  const [status, setStatus] = useState<Status>('drafted');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setErrorMsg(null);
    setStatus('writing');
    startTransition(async () => {
      const result = await confirmAndWriteAionNarrative(draftId);
      if (result.success) {
        setStatus('written');
      } else {
        setStatus('error');
        setErrorMsg(result.error);
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      await cancelAionDraft(draftId);
      setStatus('cancelled');
    });
  };

  if (status === 'written') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] text-xs">
          <Check size={12} />
          <span>Narrative updated.</span>
        </div>
      </StagePanel>
    );
  }

  if (status === 'cancelled') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-tertiary)] text-xs">
          <X size={12} />
          <span>Narrative edit cancelled.</span>
        </div>
      </StagePanel>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className={cn('p-4 flex flex-col gap-3', className)}>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
          <FileText size={12} aria-hidden />
          <span>Deal narrative</span>
        </div>

        {previousNarrative && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">Before</span>
            <p className="text-[13px] leading-relaxed text-[var(--stage-text-tertiary)] line-through decoration-[0.5px]">
              {previousNarrative}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
            {previousNarrative ? 'After' : 'New narrative'}
          </span>
          <p className="text-[13px] leading-relaxed text-[var(--stage-text-primary)] whitespace-pre-wrap">
            {newNarrative}
          </p>
        </div>

        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-2 text-[12px] text-[var(--stage-text-critical,#e0443c)]">
            <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={status === 'writing' || isPending}
            className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <X size={12} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === 'writing' || isPending}
            className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
          >
            <Check size={12} />
            {status === 'writing' ? 'Writing…' : 'Confirm & save'}
          </button>
        </div>
      </StagePanel>
    </motion.div>
  );
}
