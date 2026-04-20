'use client';

/**
 * RepliesCard — inline card on the Deal Lens showing client ↔ workspace
 * message threads for a deal. Fed by ops.message_threads + ops.messages
 * (workspace RLS; caller sees only their workspace's rows).
 *
 * Phase 1 scope:
 *   • email channel only (SMS chips render visibly in Phase 1.5)
 *   • thread groups as collapsible blocks, newest-first
 *   • Reply action opens the inline composer (wired later in this pack)
 *   • attachment chips download-only (Save to deal files in Phase 1.5)
 *   • no Aion classification badge in Phase 1 — urgency is a keyword flag
 *
 * See docs/reference/replies-design.md §3.1.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Mail, MessageSquare, Paperclip, Flame } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { formatRelTime } from '@/shared/lib/format-currency';
import { getDealReplies, type ReplyThread, type ReplyMessage } from '../api/get-deal-replies';

export type RepliesCardProps = {
  dealId: string;
  /** Hides actions that require outbound send privileges (post-handover view). */
  readOnly?: boolean;
};

export function RepliesCard({ dealId, readOnly = false }: RepliesCardProps) {
  const [threads, setThreads] = useState<ReplyThread[] | null>(null);

  const fetchThreads = useCallback(async () => {
    const data = await getDealReplies(dealId);
    setThreads(data);
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    setThreads(null);
    getDealReplies(dealId).then((data) => {
      if (!cancelled) setThreads(data);
    }).catch(() => {
      if (!cancelled) setThreads([]);
    });
    return () => { cancelled = true; };
  }, [dealId]);

  const totalMessages = threads?.reduce((acc, t) => acc + t.messages.length, 0) ?? 0;
  const hasAny = threads !== null && threads.length > 0;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 'var(--stage-gap-wide, 12px)' }}
      >
        <p className="stage-label">
          Replies
          {totalMessages > 0 && (
            <span style={{ color: 'var(--stage-text-tertiary)' }}> · {totalMessages}</span>
          )}
        </p>
      </div>

      {threads === null ? (
        <RepliesSkeleton />
      ) : !hasAny ? (
        <RepliesEmptyState />
      ) : (
        <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
          <AnimatePresence initial={false}>
            {threads.map((thread) => (
              <ReplyThreadGroup
                key={thread.id}
                thread={thread}
                readOnly={readOnly}
                onRefresh={fetchThreads}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </StagePanel>
  );
}

// =============================================================================
// Empty + loading states
// =============================================================================

function RepliesEmptyState() {
  return (
    <p
      className="stage-label"
      style={{
        color: 'var(--stage-text-tertiary)',
        paddingTop: 'var(--stage-gap, 6px)',
        paddingBottom: 'var(--stage-gap, 6px)',
      }}
    >
      No replies yet. When your client writes back, you&rsquo;ll see it here first.
    </p>
  );
}

function RepliesSkeleton() {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-2">
          <div className="size-8 shrink-0 rounded-full stage-skeleton" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 w-40 rounded stage-skeleton" />
            <div className="h-3.5 rounded stage-skeleton" />
            <div className="h-3.5 w-3/4 rounded stage-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Thread group
// =============================================================================

function ReplyThreadGroup({
  thread,
  readOnly,
  onRefresh,
}: {
  thread: ReplyThread;
  readOnly: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const lastMessage = thread.messages[thread.messages.length - 1];
  const hasUrgentInbound = thread.messages.some(
    (m) => m.direction === 'inbound' && m.urgencyKeywordMatch,
  );

  const ChannelIcon = thread.channel === 'email' ? Mail : MessageSquare;
  const displayName = thread.primaryEntityName ?? lastMessage?.fromAddress ?? 'Unknown sender';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex flex-col"
      style={{
        borderTop: '1px solid var(--stage-edge-subtle)',
        paddingTop: 'var(--stage-gap-wide, 12px)',
      }}
    >
      {/* Thread header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center min-w-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <ChannelIcon
            size={14}
            className="shrink-0"
            style={{ color: 'var(--stage-text-tertiary)' }}
          />
          <span
            className="text-sm tracking-tight font-medium truncate"
            style={{ color: 'var(--stage-text-primary)' }}
          >
            {displayName}
          </span>
          {hasUrgentInbound && (
            <Flame
              size={12}
              className="shrink-0"
              style={{ color: 'var(--color-unusonic-warning)' }}
              aria-label="Urgent keyword matched"
            />
          )}
          {thread.subject && thread.channel === 'email' && (
            <span
              className="stage-badge-text truncate"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              {thread.subject}
            </span>
          )}
        </div>
        <div className="flex items-center shrink-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <span
            className="stage-label tabular-nums"
            style={{ color: 'var(--stage-text-tertiary)' }}
            title={lastMessage ? new Date(lastMessage.createdAt).toLocaleString() : ''}
          >
            {lastMessage ? formatRelTime(lastMessage.createdAt) : ''}
          </span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={STAGE_LIGHT}>
            <ChevronDown size={14} style={{ color: 'var(--stage-text-tertiary)' }} />
          </motion.div>
        </div>
      </button>

      {/* Thread body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="flex flex-col"
              style={{
                gap: 'var(--stage-gap-wide, 12px)',
                paddingTop: 'var(--stage-gap-wide, 12px)',
              }}
            >
              {thread.messages.map((m) => (
                <ReplyMessageRow key={m.id} message={m} />
              ))}

              {!readOnly && (
                <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
                  <button
                    type="button"
                    className="stage-btn stage-btn-secondary text-xs"
                    onClick={() => {
                      // Composer wiring lands in the next pack. For now this
                      // is a no-op placeholder so the button appears in the
                      // layout while the data layer settles.
                      onRefresh();
                    }}
                  >
                    Reply
                  </button>
                  <span
                    className="stage-label"
                    style={{ color: 'var(--stage-text-tertiary)' }}
                  >
                    Composer wiring coming next
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// Message row
// =============================================================================

function ReplyMessageRow({ message }: { message: ReplyMessage }) {
  const isInbound = message.direction === 'inbound';
  const senderLabel = isInbound
    ? message.fromEntityName ?? message.fromAddress
    : message.sentByName ?? 'You';

  return (
    <div
      className="flex flex-col"
      style={{
        gap: 'var(--stage-gap, 6px)',
        padding: 'var(--stage-gap-wide, 12px)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        background: isInbound ? 'var(--ctx-well)' : 'oklch(1 0 0 / 0.02)',
        borderLeft: isInbound ? '2px solid var(--color-unusonic-info)' : '2px solid transparent',
      }}
      data-surface={isInbound ? 'well' : undefined}
    >
      <div className="flex items-center justify-between" style={{ gap: 'var(--stage-gap, 6px)' }}>
        <div className="flex items-center min-w-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <span
            className="stage-badge-text tracking-wide uppercase shrink-0"
            style={{
              color: isInbound
                ? 'var(--color-unusonic-info)'
                : 'var(--stage-text-tertiary)',
            }}
          >
            {isInbound ? 'Client' : 'You'}
          </span>
          <span
            className="text-sm tracking-tight truncate"
            style={{ color: 'var(--stage-text-primary)' }}
          >
            {senderLabel}
          </span>
        </div>
        <span
          className="stage-label shrink-0 tabular-nums"
          style={{ color: 'var(--stage-text-tertiary)' }}
          title={new Date(message.createdAt).toLocaleString()}
        >
          {formatRelTime(message.createdAt)}
        </span>
      </div>

      {message.bodyText && (
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: 'var(--stage-text-primary)' }}
        >
          {message.bodyText}
        </p>
      )}

      {message.attachments.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'var(--stage-gap, 6px)' }}>
          {message.attachments.map((att, idx) => (
            <div
              key={idx}
              className={cn(
                'inline-flex items-center rounded-md',
                'stage-badge-text',
              )}
              style={{
                gap: '6px',
                padding: '4px 8px',
                background: 'oklch(1 0 0 / 0.04)',
                border: '1px solid var(--stage-edge-subtle)',
                color: 'var(--stage-text-secondary)',
              }}
            >
              <Paperclip size={12} />
              <span className="truncate max-w-[220px]">{att.filename ?? 'attachment'}</span>
              {typeof att.size === 'number' && (
                <span style={{ color: 'var(--stage-text-tertiary)' }}>
                  {formatBytes(att.size)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outbound delivery status — subtle footer when data arrives. */}
      {!isInbound && (message.deliveredAt || message.openedAt || message.bouncedAt) && (
        <div
          className="flex items-center stage-label"
          style={{
            gap: 'var(--stage-gap, 6px)',
            color: message.bouncedAt
              ? 'var(--color-unusonic-error)'
              : 'var(--stage-text-tertiary)',
          }}
        >
          {message.bouncedAt ? (
            <span>Bounced {formatRelTime(message.bouncedAt)}</span>
          ) : message.openedAt ? (
            <span>Opened {formatRelTime(message.openedAt)}</span>
          ) : message.deliveredAt ? (
            <span>Delivered {formatRelTime(message.deliveredAt)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
