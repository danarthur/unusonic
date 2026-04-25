'use client';

/**
 * ThreadRow — collapsed view of one thread in the v2 Replies card.
 *
 * See docs/reference/replies-card-v2-design.md §5 Tier 2.
 *
 * Layout:
 *
 *   ●  [👤👤👤]  Primary + 2 others                             2h
 *                Re: Subject                                    (secondary)
 *                "latest message preview truncated to 140ch"    (primary)
 *                📎 1 · 47 messages · ● Bounced · ! Question   (tertiary meta)
 *
 * Dots on the left edge stack vertically if both unread and bounce fire.
 * Snoozed threads render at 0.5 opacity with italic timestamp.
 *
 * @module features/comms/replies/ui/ThreadRow
 */

import { motion } from 'framer-motion';
import { Mail, MessageSquare, Paperclip, Flame, AlertTriangle, BellOff } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatRelTime } from '@/shared/lib/format-currency';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { ParticipantAvatars } from './ParticipantAvatars';
import { ThreadOverflowMenu } from './ThreadOverflowMenu';
import type { ReplyThread } from '../api/get-deal-replies';

export type ThreadRowProps = {
  thread: ReplyThread;
  onExpand: () => void;
  onRefresh?: () => void;
};

function primaryName(thread: ReplyThread): string {
  if (thread.participants.length > 0) {
    return thread.participants[0].displayName;
  }
  return thread.primaryEntityName ?? 'Unknown sender';
}

function participantSuffix(thread: ReplyThread): string | null {
  const n = thread.participants.length;
  if (n <= 1) return null;
  if (n === 2) return '+ 1 other';
  return `+ ${n - 1} others`;
}

function hasUrgentInbound(thread: ReplyThread): boolean {
  return thread.messages.some((m) => m.direction === 'inbound' && !!m.urgencyKeywordMatch && !m.isAutoReply);
}

export function ThreadRow({ thread, onExpand, onRefresh }: ThreadRowProps) {
  const ChannelIcon = thread.channel === 'email' ? Mail : MessageSquare;
  const attachmentCount = thread.messages.reduce((acc, m) => acc + m.attachments.length, 0);

  const isSnoozed = !!thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date();
  const urgent = hasUrgentInbound(thread);

  const suffix = participantSuffix(thread);

  // Row is a div-as-button so the inner overflow-menu kebab can be a real
  // <button> without producing a nested-interactive HTML hydration error
  // (Next 16 / React 19 strict). aria-keyboard handling restores the
  // semantics we lose by not using a real <button> outer.
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: isSnoozed ? 0.5 : 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="flex w-full text-left transition-colors focus-visible:outline-none"
      aria-label={`Expand thread ${thread.subject ?? ''}`}
      style={{
        padding: 'var(--stage-gap-wide, 12px)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        border: '1px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
        gap: 'var(--stage-gap-wide, 12px)',
        alignItems: 'flex-start',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'oklch(1 0 0 / 0.04)';
        e.currentTarget.style.borderColor = 'var(--stage-edge-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = 'oklch(1 0 0 / 0.04)';
        e.currentTarget.style.borderColor = 'var(--stage-edge-subtle)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {/* Left edge — stacked dots + avatars */}
      <div
        className="flex flex-col items-center shrink-0"
        style={{ gap: '4px', paddingTop: '4px' }}
      >
        {/* Stacked state dots */}
        <div className="flex flex-col items-center shrink-0" style={{ gap: '3px' }}>
          {thread.unreadCount > 0 && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-unusonic-info)',
              }}
              title={`${thread.unreadCount} unread`}
              aria-label="Unread"
            />
          )}
          {thread.hasBounce && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-unusonic-error)',
              }}
              title="Undelivered bounce"
              aria-label="Bounced"
            />
          )}
          {thread.isOwed && !thread.unreadCount && !thread.hasBounce && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--stage-text-secondary)',
              }}
              title="You owe a reply"
              aria-label="Owed"
            />
          )}
        </div>
      </div>

      {/* Avatar stack */}
      <ParticipantAvatars participants={thread.participants} maxDisplay={3} size={26} />

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: '2px' }}>
        {/* Row 1: sender names + timestamp */}
        <div className="flex items-center justify-between" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <div className="flex items-center min-w-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
            <ChannelIcon
              size={12}
              className="shrink-0"
              style={{ color: 'var(--stage-text-tertiary)' }}
            />
            <span
              className="text-sm tracking-tight truncate"
              style={{
                color: 'var(--stage-text-primary)',
                fontWeight: thread.unreadCount > 0 ? 500 : 400,
              }}
            >
              {primaryName(thread)}
            </span>
            {suffix && (
              <span
                className="stage-label shrink-0"
                style={{ color: 'var(--stage-text-tertiary)' }}
              >
                {suffix}
              </span>
            )}
          </div>
          <div className="flex items-center shrink-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
            {isSnoozed && (
              <BellOff
                size={11}
                style={{ color: 'var(--stage-text-tertiary)' }}
                aria-label="Snoozed"
              />
            )}
            <span
              className={cn('stage-label tabular-nums', isSnoozed && 'italic')}
              style={{ color: 'var(--stage-text-tertiary)' }}
              title={new Date(thread.lastMessageAt).toLocaleString()}
            >
              {formatRelTime(thread.lastMessageAt)}
            </span>
            <ThreadOverflowMenu thread={thread} onActionComplete={onRefresh} />
          </div>
        </div>

        {/* Row 2: subject */}
        {thread.subject && (
          <div
            className="text-xs truncate"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            {thread.subject}
          </div>
        )}

        {/* Row 3: preview (one line) */}
        {thread.latestPreview && (
          <div
            className="text-sm truncate"
            style={{
              color: 'var(--stage-text-primary)',
              fontWeight: thread.unreadCount > 0 ? 500 : 400,
            }}
          >
            {thread.latestPreview}
          </div>
        )}

        {/* Row 4: meta (attachments, message count, chips) */}
        <div
          className="flex items-center flex-wrap stage-label"
          style={{ gap: 'var(--stage-gap, 6px)', color: 'var(--stage-text-tertiary)' }}
        >
          {attachmentCount > 0 && (
            <span
              className="inline-flex items-center"
              style={{ gap: '3px' }}
            >
              <Paperclip size={10} />
              {attachmentCount}
            </span>
          )}
          <span>
            {thread.messageCount} {thread.messageCount === 1 ? 'message' : 'messages'}
          </span>
          {thread.hasBounce && (
            <span
              className="inline-flex items-center"
              style={{ gap: '3px', color: 'var(--color-unusonic-error)' }}
            >
              <AlertTriangle size={10} />
              Bounced
            </span>
          )}
          {urgent && (
            <span
              className="inline-flex items-center"
              style={{ gap: '3px', color: 'var(--color-unusonic-warning)' }}
            >
              <Flame size={10} />
              Urgent
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
