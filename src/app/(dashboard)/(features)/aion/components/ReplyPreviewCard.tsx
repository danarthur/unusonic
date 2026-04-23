'use client';

/**
 * Reply preview + confirm card (Phase 3 Sprint 2, §3.5 send_reply).
 *
 * Rendered inline in the Aion chat after send_reply drafts a message. Shows
 * recipient + subject + body + thread context so the owner can sanity-check
 * before dispatch. The confirm button triggers confirmAndSendAionReply
 * server action, which:
 *
 *   1. Stamps confirmed_at on ops.aion_write_log
 *   2. Passes requireConfirmed() gate
 *   3. Dispatches via the existing Replies sendReply server action (Resend)
 *   4. Stamps executed_at on success
 *
 * Non-negotiable rail (§5 hard constraint 12): no auto-send. The user must
 * explicitly click Confirm. Cancel marks the draft as cancelled — no replay.
 */

import React, { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Mail, Check, X, AlertCircle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import {
  confirmAndSendAionReply,
  cancelAionDraft,
} from '@/app/(dashboard)/(features)/aion/actions/write-confirmations';

export interface ReplyPreviewCardProps {
  draftId: string;
  threadId: string;
  subject: string;
  to: string | null;
  bodyText: string;
  className?: string;
}

type Status = 'drafted' | 'sending' | 'sent' | 'cancelled' | 'error';

export function ReplyPreviewCard({
  draftId,
  subject,
  to,
  bodyText,
  className,
}: ReplyPreviewCardProps) {
  const [status, setStatus] = useState<Status>('drafted');
  const [editableBody, setEditableBody] = useState(bodyText);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setErrorMsg(null);
    setStatus('sending');
    startTransition(async () => {
      const result = await confirmAndSendAionReply(draftId);
      if (result.success) {
        setStatus('sent');
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

  if (status === 'sent') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] text-xs">
          <Check size={12} />
          <span>Reply sent{to ? ` to ${to}` : ''}.</span>
        </div>
      </StagePanel>
    );
  }

  if (status === 'cancelled') {
    return (
      <StagePanel elevated className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-[var(--stage-text-tertiary)] text-xs">
          <X size={12} />
          <span>Draft cancelled.</span>
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
        {/* Header — recipient + subject */}
        <div className="flex items-start gap-2">
          <Mail size={12} className="mt-0.5 shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">To</span>
              <span className="text-[13px] text-[var(--stage-text-primary)] truncate">{to ?? '(unresolved recipient)'}</span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
              <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">Subject</span>
              <span className="text-[13px] text-[var(--stage-text-secondary)] truncate">{subject}</span>
            </div>
          </div>
        </div>

        {/* Editable body — owner can tweak before confirming */}
        <textarea
          value={editableBody}
          onChange={(e) => setEditableBody(e.target.value)}
          rows={6}
          disabled={status === 'sending' || isPending}
          className="w-full resize-none bg-[var(--ctx-well)] text-[var(--stage-text-primary)] leading-relaxed p-3 outline-none border border-[oklch(1_0_0_/_0.08)] focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)]"
          style={{
            fontSize: 'var(--stage-input-font-size, 13px)',
            borderRadius: 'var(--stage-radius-input, 6px)',
          }}
        />

        {/* Error state */}
        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-2 text-[12px] text-[var(--stage-text-critical,#e0443c)]">
            <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Actions — Confirm ships; Cancel marks draft inert. */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={status === 'sending' || isPending}
            className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <X size={12} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === 'sending' || isPending || !to || editableBody.trim().length === 0}
            className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
          >
            <Check size={12} />
            {status === 'sending' ? 'Sending…' : 'Confirm & send'}
          </button>
        </div>
      </StagePanel>
    </motion.div>
  );
}
