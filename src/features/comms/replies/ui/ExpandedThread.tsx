'use client';

/**
 * ExpandedThread — the in-line expansion of a single thread.
 *
 * See docs/reference/replies-card-v2-design.md §5 Tier 3.
 *
 * Behavior:
 *   - Sticky header with primary contact + subject + collapse affordance
 *   - Latest N messages visible by default (N=5, but additionally ensure
 *     we never split a calendar day — if the 5th message's day is cut,
 *     include the rest of that day too)
 *   - "Show N earlier messages · <date range>" ghost row at top when
 *     there's more history
 *   - Date dividers between calendar days
 *   - Auto-reply aggregation group at the bottom for standalone OOOs
 *     (Phase 2B — for now render inline with muted treatment)
 *   - Single ReplyComposer at the bottom (unfocused on initial mount)
 *
 * @module features/comms/replies/ui/ExpandedThread
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Mail, MessageSquare } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { formatRelTime } from '@/shared/lib/format-currency';
import { MessageTile } from './MessageTile';
import { ReplyComposer } from './ReplyComposer';
import type { ReplyThread, ReplyMessage } from '../api/get-deal-replies';

export type ExpandedThreadProps = {
  thread: ReplyThread;
  onCollapse: () => void;
  onRefresh: () => void;
  readOnly?: boolean;
  /** Search query from the card-level search input; used to filter visible
   *  messages. Empty string disables filtering. */
  searchQuery?: string;
};

const DEFAULT_VISIBLE_COUNT = 5;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ymd = (x: Date) => x.toISOString().slice(0, 10);

  if (ymd(d) === ymd(now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (ymd(d) === ymd(yesterday)) return 'Yesterday';

  const thisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Compute the initial visible slice. Take the last DEFAULT_VISIBLE_COUNT
 * messages but extend backwards to include any additional messages from
 * the same calendar day so we don't mid-truncate a day's exchange.
 */
function computeInitiallyVisible(messages: ReplyMessage[]): {
  visible: ReplyMessage[];
  hidden: ReplyMessage[];
} {
  if (messages.length <= DEFAULT_VISIBLE_COUNT) {
    return { visible: messages, hidden: [] };
  }

  const startIdx = messages.length - DEFAULT_VISIBLE_COUNT;
  const cutoffDay = dayKey(messages[startIdx].createdAt);

  // Walk backwards from startIdx; include any earlier messages still on the
  // same day as the cutoff.
  let realStart = startIdx;
  while (realStart > 0 && dayKey(messages[realStart - 1].createdAt) === cutoffDay) {
    realStart--;
  }

  return {
    visible: messages.slice(realStart),
    hidden: messages.slice(0, realStart),
  };
}

function filterMessagesBySearch(messages: ReplyMessage[], query: string): ReplyMessage[] {
  if (!query.trim()) return messages;
  const needle = query.toLowerCase();
  return messages.filter((m) => {
    const body = (m.bodyText ?? '').toLowerCase();
    const from = (m.fromAddress ?? '').toLowerCase();
    return body.includes(needle) || from.includes(needle);
  });
}

export function ExpandedThread({
  thread,
  onCollapse,
  onRefresh,
  readOnly = false,
  searchQuery = '',
}: ExpandedThreadProps) {
  const [showingHistory, setShowingHistory] = useState(false);

  const filtered = useMemo(
    () => filterMessagesBySearch(thread.messages, searchQuery),
    [thread.messages, searchQuery],
  );

  const { visible, hidden } = useMemo(
    () => (showingHistory || searchQuery.trim()
      ? { visible: filtered, hidden: [] }
      : computeInitiallyVisible(filtered)),
    [filtered, showingHistory, searchQuery],
  );

  const ChannelIcon = thread.channel === 'email' ? Mail : MessageSquare;

  // Group visible messages by day for divider insertion.
  const groups = useMemo(() => {
    const byDay = new Map<string, ReplyMessage[]>();
    for (const m of visible) {
      const k = dayKey(m.createdAt);
      const arr = byDay.get(k) ?? [];
      arr.push(m);
      byDay.set(k, arr);
    }
    return Array.from(byDay.entries());
  }, [visible]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col"
      style={{
        padding: 'var(--stage-gap-wide, 12px)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        background: 'var(--ctx-well)',
        border: '1px solid var(--stage-edge-subtle)',
        gap: 'var(--stage-gap-wide, 12px)',
      }}
      data-surface="well"
    >
      {/* Sticky header */}
      <div
        className="flex items-center justify-between sticky"
        style={{
          top: 0,
          zIndex: 1,
          gap: 'var(--stage-gap, 6px)',
          paddingBottom: 'var(--stage-gap, 6px)',
          borderBottom: '1px solid var(--stage-edge-subtle)',
          background: 'var(--ctx-well)',
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <ChannelIcon
            size={12}
            className="shrink-0"
            style={{ color: 'var(--stage-text-tertiary)' }}
          />
          <span
            className="text-sm tracking-tight truncate"
            style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}
          >
            {thread.participants[0]?.displayName ?? thread.primaryEntityName ?? 'Unknown sender'}
            {thread.participants.length > 1 &&
              (thread.participants.length === 2
                ? ' + 1 other'
                : ` + ${thread.participants.length - 1} others`)}
          </span>
          {thread.subject && (
            <span
              className="stage-label truncate"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              {thread.subject}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Collapse thread"
          onClick={onCollapse}
          className="inline-flex items-center justify-center shrink-0"
          style={{
            width: 20,
            height: 20,
            color: 'var(--stage-text-tertiary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ChevronUp size={14} />
        </button>
      </div>

      {/* Show earlier messages ghost row */}
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => setShowingHistory(true)}
          className="w-full text-left transition-colors"
          style={{
            padding: 'var(--stage-gap-wide, 12px)',
            borderRadius: 'var(--stage-radius-nested, 8px)',
            border: '1px dashed var(--stage-edge-subtle)',
            background: 'transparent',
            color: 'var(--stage-text-tertiary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'oklch(1 0 0 / 0.02)';
            e.currentTarget.style.borderColor = 'var(--stage-text-tertiary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--stage-edge-subtle)';
          }}
        >
          Show {hidden.length} earlier {hidden.length === 1 ? 'message' : 'messages'}
          {hidden.length >= 2 && (
            <>
              {' · '}
              {formatDayDivider(hidden[0].createdAt)} →{' '}
              {formatDayDivider(hidden[hidden.length - 1].createdAt)}
            </>
          )}
        </button>
      )}

      {/* No results from search */}
      {searchQuery.trim() && visible.length === 0 && (
        <div
          className="text-xs"
          style={{ color: 'var(--stage-text-tertiary)', padding: 'var(--stage-gap, 6px)' }}
        >
          No messages in this thread match &ldquo;{searchQuery}&rdquo;.
        </div>
      )}

      {/* Messages grouped by day */}
      <AnimatePresence initial={false}>
        {groups.map(([day, dayMessages]) => (
          <motion.div
            key={day}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col"
            style={{ gap: 'var(--stage-gap-wide, 12px)' }}
          >
            {/* Date divider */}
            <div
              className="flex items-center stage-label"
              style={{ gap: 'var(--stage-gap, 6px)', color: 'var(--stage-text-tertiary)' }}
            >
              <div style={{ flex: 1, height: 1, background: 'var(--stage-edge-subtle)' }} />
              <span style={{ whiteSpace: 'nowrap' }}>
                {formatDayDivider(dayMessages[0].createdAt)}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--stage-edge-subtle)' }} />
            </div>
            {dayMessages.map((m) => (
              <MessageTile key={m.id} message={m} />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Composer */}
      {!readOnly && (
        <ReplyComposer
          threadId={thread.id}
          onSent={onRefresh}
          onCancel={() => {
            // No-op: composer stays rendered in v2, cancel just clears the
            // textarea. The composer owns its own expanded/collapsed state.
          }}
        />
      )}

      {/* Outbound-only footer meta */}
      <div
        className="stage-label tabular-nums"
        style={{ color: 'var(--stage-text-tertiary)', textAlign: 'right' }}
        title={new Date(thread.lastMessageAt).toLocaleString()}
      >
        Last activity {formatRelTime(thread.lastMessageAt)}
      </div>
    </motion.div>
  );
}
