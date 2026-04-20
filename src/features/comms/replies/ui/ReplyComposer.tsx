'use client';

/**
 * ReplyComposer — inline composer that opens below a thread in RepliesCard.
 *
 * Phase 1: email only. SMS outbound + channel picker ships in Phase 1.5
 * (SMS-first composer design TBD — production owners keep their personal
 * cell per the Replies design doc §2.4).
 *
 * Insert-first-then-send pattern is handled server-side in send-reply.ts.
 * This component only knows: "I have a thread id, user typed something,
 * send it." Error surfaces via toast.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { Button } from '@/shared/ui/button';
import { sendReply } from '../api/send-reply';

export type ReplyComposerProps = {
  threadId: string;
  /** Called after a successful send so the parent card can refetch the thread. */
  onSent: () => void;
  onCancel: () => void;
};

export function ReplyComposer({ threadId, onSent, onCancel }: ReplyComposerProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error('Type a reply first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sendReply({ threadId, bodyText: trimmed });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success('Reply sent.');
      setBody('');
      onSent();
    } finally {
      setSubmitting(false);
    }
  }, [body, onSent, submitting, threadId]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_MEDIUM}
      style={{ overflow: 'hidden' }}
    >
      <div
        className="p-3 rounded-lg flex flex-col"
        style={{
          gap: 'var(--stage-gap, 6px)',
          border: '1px solid var(--stage-edge-subtle)',
          background: 'var(--ctx-well)',
          marginTop: 'var(--stage-gap, 6px)',
        }}
        data-surface="well"
      >
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          rows={4}
          disabled={submitting}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="w-full bg-transparent text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] resize-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-md p-1"
        />
        <div className="flex items-center justify-between" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <span
            className="text-[11px]"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            Sends from your workspace address · Cmd+Enter to send
          </span>
          <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-2 py-1 transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
