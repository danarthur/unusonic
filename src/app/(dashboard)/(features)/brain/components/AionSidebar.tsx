'use client';

import { useMemo, useState } from 'react';
import { Plus, PanelLeftClose, Trash2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { SessionMeta } from '@/shared/ui/providers/SessionContext';

// ---------------------------------------------------------------------------
// Time bucket grouping
// ---------------------------------------------------------------------------

type TimeBucket = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

function getBucket(updatedAt: number): TimeBucket {
  const now = Date.now();
  const diff = now - updatedAt;
  const ONE_DAY = 86_400_000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (updatedAt >= todayStart.getTime()) return 'Today';
  if (updatedAt >= todayStart.getTime() - ONE_DAY) return 'Yesterday';
  if (diff < 7 * ONE_DAY) return 'Previous 7 days';
  return 'Older';
}

function relativeTime(updatedAt: number): string {
  const diff = Date.now() - updatedAt;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const BUCKET_ORDER: TimeBucket[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

// ---------------------------------------------------------------------------
// AionSidebar
// ---------------------------------------------------------------------------

interface AionSidebarProps {
  sessions: SessionMeta[];
  currentSessionId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function AionSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onNewChat,
  onDelete,
  isOpen,
  onToggle,
}: AionSidebarProps) {
  const [search, setSearch] = useState('');

  // Filter, sort, and group sessions
  const grouped = useMemo(() => {
    const query = search.toLowerCase().trim();
    const valid = sessions
      .filter((s) => s.preview && s.preview.trim().length > 0)
      .filter((s) => !query || s.preview.toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);

    const buckets = new Map<TimeBucket, SessionMeta[]>();
    for (const s of valid) {
      const bucket = getBucket(s.updatedAt);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(s);
    }
    return buckets;
  }, [sessions]);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40 bg-[oklch(0.06_0_0/0.75)] lg:hidden"
            onClick={onToggle}
          />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="shrink-0 overflow-hidden h-full fixed lg:relative z-50 lg:z-auto"
            data-surface="surface"
          >
            <div className="flex flex-col h-full w-[260px] bg-[var(--stage-surface)] border-r border-[var(--stage-edge-subtle)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)] select-none">
                Conversations
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="p-1.5 rounded-[6px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]"
                  aria-label="New chat"
                >
                  <Plus size={15} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={onToggle}
                  className="p-1.5 rounded-[6px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]"
                  aria-label="Close sidebar"
                >
                  <PanelLeftClose size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={13} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)] rounded-md pl-7 pr-2.5 py-1.5 text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[var(--stage-accent)] transition-colors duration-[80ms]"
                />
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-4">
              {grouped.size === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-[var(--stage-text-tertiary)] select-none">
                  No conversations yet
                </p>
              ) : (
                BUCKET_ORDER.map((bucket) => {
                  const items = grouped.get(bucket);
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={bucket} className="mb-3">
                      <p className="px-2 pt-3 pb-1.5 stage-label font-mono text-[var(--stage-text-tertiary)] select-none">
                        {bucket}
                      </p>
                      {items.map((session) => {
                        const isActive = session.id === currentSessionId;
                        return (
                          <div
                            key={session.id}
                            className={cn(
                              'relative w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-[80ms] group/item cursor-pointer',
                              isActive
                                ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)]'
                                : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)]',
                            )}
                            onClick={() => onSelect(session.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(session.id); }}
                          >
                            <p className="text-sm truncate leading-snug pr-6">
                              {session.preview || 'New conversation'}
                            </p>
                            <p className="text-label text-[var(--stage-text-tertiary)] mt-0.5">
                              {relativeTime(session.updatedAt)}
                            </p>
                            {/* Delete button — hover-reveal */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                              className="absolute top-2 right-1.5 p-1 rounded-[4px] opacity-0 group-hover/item:opacity-100 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] hover:bg-[oklch(1_0_0_/_0.06)] transition-[opacity,color,background-color] duration-[80ms]"
                              aria-label="Delete conversation"
                            >
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
