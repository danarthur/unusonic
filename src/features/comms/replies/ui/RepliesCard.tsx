'use client';

/**
 * RepliesCard v2 — orchestrates the Replies card on the Deal Lens.
 *
 * See docs/reference/replies-card-v2-design.md.
 *
 * Composition:
 *   - Card chrome: title + "Replies · N threads · M unread" + search icon
 *     + "Compose" (Phase 2B — hidden in PR #20)
 *   - OwedIndicator: the single "what do I owe" line
 *   - CardSearchInput: expandable ⌘F search bar
 *   - Thread list: ThreadRow stacked collapsed, or ExpandedThread for the
 *     one currently open (one-at-a-time, Apple-Mail style)
 *   - Empty / loading / search-empty states
 *
 * @module features/comms/replies/ui/RepliesCard
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { getDealReplies, type ReplyThread } from '../api/get-deal-replies';
import { ThreadRow } from './ThreadRow';
import { ExpandedThread } from './ExpandedThread';
import { OwedIndicator } from './OwedIndicator';
import { CardSearchInput } from './CardSearchInput';

export type RepliesCardProps = {
  dealId: string;
  /** Hides outbound-send privileges in Phase 1 (post-handover view). */
  readOnly?: boolean;
};

function threadMatchesSearch(thread: ReplyThread, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.toLowerCase();
  if ((thread.subject ?? '').toLowerCase().includes(needle)) return true;
  if ((thread.latestPreview ?? '').toLowerCase().includes(needle)) return true;
  return thread.messages.some(
    (m) =>
      (m.bodyText ?? '').toLowerCase().includes(needle) ||
      (m.fromAddress ?? '').toLowerCase().includes(needle),
  );
}

export function RepliesCard({ dealId, readOnly = false }: RepliesCardProps) {
  const [threads, setThreads] = useState<ReplyThread[] | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchThreads = useCallback(async () => {
    const data = await getDealReplies(dealId);
    setThreads(data);
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    getDealReplies(dealId)
      .then((data) => {
        if (!cancelled) setThreads(data);
      })
      .catch(() => {
        if (!cancelled) setThreads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Keyboard shortcut: ⌘F / Ctrl+F toggles the search input when the card
  // is focused-within. Use the ResizeObserver-less approach — check if
  // any descendant has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        // Only hijack if the card has focus-within (user is working inside it).
        const card = document.getElementById(`replies-card-${dealId}`);
        if (card && card.contains(document.activeElement)) {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dealId]);

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (!searchQuery.trim()) return threads;
    return threads.filter((t) => threadMatchesSearch(t, searchQuery));
  }, [threads, searchQuery]);

  const totalUnread = useMemo(
    () => threads?.reduce((acc, t) => acc + t.unreadCount, 0) ?? 0,
    [threads],
  );

  const threadCount = threads?.length ?? 0;
  const hasAny = threadCount > 0;

  const expandedThread = useMemo(
    () => filteredThreads.find((t) => t.id === expandedThreadId) ?? null,
    [filteredThreads, expandedThreadId],
  );

  return (
    <StagePanel
      elevated
      style={{ padding: 'var(--stage-padding, 16px)' }}
    >
      <div id={`replies-card-${dealId}`}>
        {/* Card chrome — title + count chips + search icon */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 'var(--stage-gap-wide, 12px)' }}
        >
          <p className="stage-label">
            Replies
            {threadCount > 0 && (
              <>
                <span style={{ color: 'var(--stage-text-tertiary)' }}>
                  {' · '}
                  {threadCount} {threadCount === 1 ? 'thread' : 'threads'}
                </span>
                {totalUnread > 0 && (
                  <span style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}>
                    {' · '}
                    {totalUnread} unread
                  </span>
                )}
              </>
            )}
          </p>
          {hasAny && (
            <button
              type="button"
              aria-label="Search messages"
              onClick={() => setSearchOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-md transition-colors"
              style={{
                width: 24,
                height: 24,
                color: searchOpen
                  ? 'var(--stage-text-primary)'
                  : 'var(--stage-text-tertiary)',
                background: searchOpen ? 'oklch(1 0 0 / 0.06)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Search size={14} />
            </button>
          )}
        </div>

        {threads === null ? (
          <RepliesSkeleton />
        ) : !hasAny ? (
          <RepliesEmptyState />
        ) : (
          <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
            {/* Owed indicator */}
            <OwedIndicator threads={threads} />

            {/* Search input */}
            <CardSearchInput
              open={searchOpen}
              onOpenChange={setSearchOpen}
              value={searchQuery}
              onChange={setSearchQuery}
            />

            {/* Thread list — either all collapsed, or one expanded with
                the others collapsed. */}
            <AnimatePresence initial={false}>
              {expandedThread ? (
                <motion.div
                  key={expandedThread.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_MEDIUM}
                >
                  <ExpandedThread
                    thread={expandedThread}
                    onCollapse={() => setExpandedThreadId(null)}
                    onRefresh={fetchThreads}
                    readOnly={readOnly}
                    searchQuery={searchQuery}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="thread-list"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_LIGHT}
                  className="flex flex-col"
                  style={{ gap: 'var(--stage-gap, 6px)' }}
                >
                  {filteredThreads.length === 0 ? (
                    <div
                      className="text-xs"
                      style={{
                        color: 'var(--stage-text-tertiary)',
                        padding: 'var(--stage-gap-wide, 12px)',
                      }}
                    >
                      No threads match &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    filteredThreads.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        onExpand={() => setExpandedThreadId(thread.id)}
                        onRefresh={fetchThreads}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
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
