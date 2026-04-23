'use client';

/**
 * Follow-up preview + confirm card (Phase 3 §3.5 schedule_followup).
 *
 * Shows the deal, scheduled time, channel, and the optional drafted body.
 * Confirm enqueues a row into ops.follow_up_queue via
 * confirmAndEnrollAionFollowUp. Cancel marks the aion_write_log row inert.
 */

import React, { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Clock, Check, X, Mail, MessageSquare, AlertCircle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import {
  confirmAndEnrollAionFollowUp,
  cancelAionDraft,
} from '@/app/(dashboard)/(features)/aion/actions/write-confirmations';

export interface FollowupPreviewCardProps {
  draftId: string;
  dealId: string;
  scheduledFor: string;
  channel: 'email' | 'sms';
  draftBody: string | null;
  remindOwnerFirst: boolean;
  className?: string;
}

type Status = 'drafted' | 'enqueuing' | 'queued' | 'cancelled' | 'error';

export function FollowupPreviewCard({
  draftId,
  scheduledFor,
  channel,
  draftBody,
  remindOwnerFirst,
  className,
}: FollowupPreviewCardProps) {
  const [status, setStatus] = useState<Status>('drafted');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setErrorMsg(null);
    setStatus('enqueuing');
    startTransition(async () => {
      const result = await confirmAndEnrollAionFollowUp(draftId);
      if (result.success) {
        setStatus('queued');
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

  if (status === 'queued') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] text-xs">
          <Check size={12} />
          <span>Follow-up queued for {formatSchedule(scheduledFor)}.</span>
        </div>
      </StagePanel>
    );
  }

  if (status === 'cancelled') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-tertiary)] text-xs">
          <X size={12} />
          <span>Follow-up cancelled.</span>
        </div>
      </StagePanel>
    );
  }

  const ChannelIcon = channel === 'email' ? Mail : MessageSquare;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className={cn('p-4 flex flex-col gap-3', className)}>
        {/* Meta */}
        <div className="flex items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
            <Clock size={12} aria-hidden />
            {formatSchedule(scheduledFor)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
            <ChannelIcon size={12} aria-hidden />
            {channel === 'email' ? 'Email' : 'SMS'}
          </span>
          {remindOwnerFirst && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
              Soft-confirm 1h before
            </span>
          )}
        </div>

        {draftBody && (
          <p
            className="text-[13px] leading-relaxed text-[var(--stage-text-secondary)] whitespace-pre-wrap italic"
            style={{ fontSize: 'var(--stage-input-font-size, 13px)' }}
          >
            &ldquo;{draftBody}&rdquo;
          </p>
        )}

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
            disabled={status === 'enqueuing' || isPending}
            className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <X size={12} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === 'enqueuing' || isPending}
            className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
          >
            <Check size={12} />
            {status === 'enqueuing' ? 'Queuing…' : 'Confirm & queue'}
          </button>
        </div>
      </StagePanel>
    </motion.div>
  );
}

function formatSchedule(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
