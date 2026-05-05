'use client';

/**
 * Inline nudge composer for the AionDealCard.
 *
 * Extracted from aion-deal-card.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Renders below the footer CTAs when the user clicks Draft. Phase 1 logs the
 * nudge as sent manually via `actOnFollowUp` (writes a follow_up_log row +
 * flips the queue item to 'acted'). Phase 2 will wire email/SMS sending
 * through Resend/Twilio so "Send" actually dispatches.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { OutboundRow } from '../../actions/get-aion-card-for-deal';
import { actOnFollowUp } from '../../actions/follow-up-actions';

type NudgeChannel = 'email' | 'sms' | 'call';

function resolveInitialChannel(row: OutboundRow): NudgeChannel {
  const c = (row.suggestedChannel ?? '').toLowerCase();
  if (c === 'phone' || c === 'call') return 'call';
  if (c === 'sms' || c === 'text') return 'sms';
  return 'email';
}

export function NudgeComposer({
  row,
  onCancel,
  onSubmitted,
}: {
  row: OutboundRow;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [channel, setChannel] = React.useState<NudgeChannel>(() => resolveInitialChannel(row));
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!message.trim()) {
      toast.error('Add a message or call summary first.');
      return;
    }
    setSubmitting(true);
    try {
      const actionType =
        channel === 'email' ? 'email_sent' : channel === 'sms' ? 'sms_sent' : 'call_logged';
      const res = await actOnFollowUp(
        row.followUpId,
        actionType,
        channel === 'call' ? 'call' : channel,
        undefined,
        message.trim(),
      );
      if (!res.success) {
        toast.error(res.error ?? 'Could not log nudge.');
        return;
      }
      toast.success(channel === 'call' ? 'Call logged.' : 'Nudge logged.');
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    channel === 'call' ? 'Log call' : channel === 'sms' ? 'Log text' : 'Log email';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_MEDIUM}
      className="overflow-hidden"
    >
      <div
        className="mt-3 p-3 rounded-lg flex flex-col gap-2"
        style={{
          border: '1px solid var(--stage-edge-subtle)',
          background: 'var(--ctx-well)',
        }}
        data-surface="well"
      >
        <div className="flex items-center gap-1">
          {(['email', 'sms', 'call'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              disabled={submitting}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition-colors',
                channel === ch
                  ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.10)]'
                  : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
              )}
            >
              {ch === 'email' ? 'Email' : ch === 'sms' ? 'Text' : 'Call'}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            channel === 'call'
              ? 'Summary of the call…'
              : channel === 'sms'
                ? 'What did you text?'
                : 'What did you send?'
          }
          rows={3}
          disabled={submitting}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="w-full bg-transparent text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] resize-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-md p-1"
        />

        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px]"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            Logs as sent manually. Sending via Resend/Twilio comes next.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-2 py-1 transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Logging…' : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
