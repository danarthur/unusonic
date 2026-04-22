'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  PanelLeftClose,
  Trash2,
  Search,
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Briefcase,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  GitBranch,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { SessionMeta } from '@/shared/ui/providers/SessionContext';
import {
  getArchivedSessionList,
  unarchiveSession,
  type DbSessionMeta,
} from '@/app/(dashboard)/(features)/aion/actions/aion-session-actions';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

// ---------------------------------------------------------------------------
// 3-level scope hierarchy
//
//   Productions
//     └─ <deal group header, e.g. "Ally & Emily Wedding">
//         ├─ <thread title, 28-char truncate>
//         ├─ <thread title>
//         └─ <thread title>
//     └─ <another deal group>
//   General
//     └─ <unscoped chats>
//
// Matches ChatGPT / Claude Projects where a project holds many chats per
// entity. Deal groups are collapsible. Within each deal, pinned threads
// sort to the top (capped at 3 by the pin RPC), then by recency.
// Design: docs/reference/aion-deal-chat-design.md §2.2 + 2026-04-21
// multi-thread pass.
// ---------------------------------------------------------------------------

const SESSION_LIMIT = 80;
const MAX_TITLE_CHARS = 28;

type ProductionGroup = {
  scopeEntityId: string;
  /** Deal title from public.deals (enriched server-side per list fetch). */
  title: string;
  sessions: SessionMeta[];
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function sessionLabel(s: SessionMeta): string {
  const raw = s.title?.trim() || s.preview?.trim() || 'New conversation';
  return truncate(raw, MAX_TITLE_CHARS);
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

// Within-scope sort: pinned first (by pinnedAt DESC), then by lastMessageAt DESC.
// Field Expert recommendation — matches ChatGPT Projects order.
function sortWithinScope(a: SessionMeta, b: SessionMeta): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.isPinned && b.isPinned) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  return b.lastMessageAt - a.lastMessageAt;
}

// Between-deal sort: deal with the most recently-touched thread floats first.
function mostRecentWithin(sessions: SessionMeta[]): number {
  return sessions.reduce((max, s) => Math.max(max, s.lastMessageAt), 0);
}

// Local DB→view converter for archived sessions — the main SessionContext
// converter isn't exported. Kept minimal: archived rows don't need precise
// lastMessageAt timing because they sort by archived_at on the server.
function dbSessionMetaToSessionMeta(db: DbSessionMeta): SessionMeta {
  return {
    id: db.id,
    createdAt: new Date(db.created_at).getTime(),
    updatedAt: new Date(db.updated_at).getTime(),
    lastMessageAt: new Date(db.last_message_at).getTime(),
    preview: db.preview ?? '',
    title: db.title,
    scopeType: db.scope_type,
    scopeEntityId: db.scope_entity_id,
    scopeEntityTitle: db.scope_entity_title,
    titleLocked: db.title_locked,
    isPinned: db.is_pinned,
    pinnedAt: db.pinned_at ? new Date(db.pinned_at).getTime() : null,
    pinned: db.pinned,
  };
}

// ---------------------------------------------------------------------------
// AionSidebar
// ---------------------------------------------------------------------------

interface AionSidebarProps {
  sessions: SessionMeta[];
  currentSessionId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  /** Fired when the user clicks the "+" on a deal group header. Creates a
   *  fresh thread under that scope without resuming an existing one. */
  onNewScopedChat?: (args: { scopeType: 'deal' | 'event'; scopeEntityId: string }) => void;
  /** Pin a thread (max 3 per scope bucket). */
  onPin?: (sessionId: string) => void;
  /** Unpin a pinned thread. */
  onUnpin?: (sessionId: string) => void;
  /** Soft-delete via archived_at — session drops from main list but stays
   *  restorable from the "Show archived" view. */
  onArchive?: (sessionId: string) => void;
  /** Spawn a fresh thread titled "Continuing: <source>" under the same
   *  scope. Field Expert's merge-escape-valve. Scoped-only (deal/event). */
  onContinueInNewChat?: (sessionId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function AionSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onNewChat,
  onDelete,
  onNewScopedChat,
  onPin,
  onUnpin,
  onArchive,
  onContinueInNewChat,
  isOpen,
  onToggle,
}: AionSidebarProps) {
  const workspaceId = useRequiredWorkspace();
  const [search, setSearch] = useState('');
  const [collapsedDeals, setCollapsedDeals] = useState<Set<string>>(() => new Set());

  // Archived view — hidden by default (Field Expert: "archived stay searchable
  // but don't clutter the per-deal list"). Loaded lazily on first toggle.
  const [showArchived, setShowArchived] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<SessionMeta[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const fetchArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const result = await getArchivedSessionList(workspaceId);
      if (!result.success) {
        toast.error('Could not load archived chats.');
        setArchivedSessions([]);
        return;
      }
      setArchivedSessions(result.sessions.map(dbSessionMetaToSessionMeta));
    } finally {
      setArchivedLoading(false);
    }
  }, [workspaceId]);

  // Lazy-load archived list on first toggle; refetch on subsequent toggles
  // so newly-archived rows show up without a page reload.
  useEffect(() => {
    if (showArchived) void fetchArchived();
  }, [showArchived, fetchArchived]);

  const handleRestore = useCallback(async (id: string) => {
    const result = await unarchiveSession(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    // Drop from local archived list; the main session list will pick it up
    // on the next full hydrate (page reload / provider remount). Optimistic
    // for immediate feedback.
    setArchivedSessions(prev => prev?.filter(s => s.id !== id) ?? null);
    toast.success('Restored.');
  }, []);

  const { productions, general } = useMemo(() => {
    const query = search.toLowerCase().trim();

    // Filter: keep sessions with ANY signal so fresh threads show up before
    // the first message writes a preview.
    const visible = sessions
      .filter((s) => (
        (s.title && s.title.trim().length > 0)
        || (s.preview && s.preview.trim().length > 0)
        || s.isPinned
        || s.scopeType === 'deal'
      ))
      .filter((s) => {
        if (!query) return true;
        const hay = `${s.title ?? ''} ${s.preview ?? ''} ${s.scopeEntityTitle ?? ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, SESSION_LIMIT);

    // Group deal-scoped sessions by scope_entity_id.
    const dealBuckets = new Map<string, { title: string; sessions: SessionMeta[] }>();
    const generalSessions: SessionMeta[] = [];

    for (const s of visible) {
      if (s.scopeType === 'deal' && s.scopeEntityId) {
        const bucket = dealBuckets.get(s.scopeEntityId) ?? {
          title: s.scopeEntityTitle ?? 'Untitled production',
          sessions: [],
        };
        // The live-fetched title wins if present on any session in the bucket.
        if (s.scopeEntityTitle) bucket.title = s.scopeEntityTitle;
        bucket.sessions.push(s);
        dealBuckets.set(s.scopeEntityId, bucket);
      } else {
        generalSessions.push(s);
      }
    }

    const productions: ProductionGroup[] = Array.from(dealBuckets.entries())
      .map(([scopeEntityId, { title, sessions: ss }]) => ({
        scopeEntityId,
        title,
        sessions: [...ss].sort(sortWithinScope),
      }))
      .sort((a, b) => mostRecentWithin(b.sessions) - mostRecentWithin(a.sessions));

    const general = [...generalSessions].sort(sortWithinScope);

    return { productions, general };
  }, [sessions, search]);

  const toggleDealCollapse = (scopeEntityId: string) => {
    setCollapsedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(scopeEntityId)) next.delete(scopeEntityId);
      else next.add(scopeEntityId);
      return next;
    });
  };

  const isEmpty = productions.length === 0 && general.length === 0;

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
                    aria-label="New general chat"
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

              {/* 3-level list */}
              <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-4">
                {isEmpty ? (
                  <p className="px-2 py-8 text-center text-xs text-[var(--stage-text-tertiary)] select-none">
                    No conversations yet
                  </p>
                ) : (
                  <>
                    {/* Productions */}
                    {productions.length > 0 && (
                      <div className="mb-3">
                        <p className="px-2 pt-3 pb-1.5 stage-label font-mono text-[var(--stage-text-tertiary)] select-none flex items-center gap-1">
                          <Briefcase size={10} strokeWidth={1.5} aria-hidden />
                          Productions
                        </p>
                        {productions.map((group) => (
                          <ProductionGroupRow
                            key={group.scopeEntityId}
                            group={group}
                            currentSessionId={currentSessionId}
                            collapsed={collapsedDeals.has(group.scopeEntityId)}
                            onToggleCollapse={() => toggleDealCollapse(group.scopeEntityId)}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onNewScopedChat={onNewScopedChat}
                            onPin={onPin}
                            onUnpin={onUnpin}
                            onArchive={onArchive}
                            onContinueInNewChat={onContinueInNewChat}
                          />
                        ))}
                      </div>
                    )}

                    {/* General */}
                    {general.length > 0 && (
                      <div className="mb-3">
                        <p className="px-2 pt-3 pb-1.5 stage-label font-mono text-[var(--stage-text-tertiary)] select-none">
                          General
                        </p>
                        {general.map((session) => (
                          <SessionRow
                            key={session.id}
                            session={session}
                            isActive={session.id === currentSessionId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onPin={onPin}
                            onUnpin={onUnpin}
                            onArchive={onArchive}
                            onContinueInNewChat={onContinueInNewChat}
                            indented={false}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Archived section — collapsible, lazy-loaded on first open */}
                <div className="mt-4 pt-3 border-t border-[oklch(1_0_0_/_0.04)]">
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1 rounded-md',
                      'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                      'hover:bg-[oklch(1_0_0_/_0.03)] transition-colors duration-[80ms]',
                    )}
                  >
                    <span className="stage-label font-mono flex items-center gap-1">
                      <Archive size={10} strokeWidth={1.5} aria-hidden />
                      Archived
                    </span>
                    {showArchived ? (
                      <ChevronDown size={11} strokeWidth={1.5} aria-hidden />
                    ) : (
                      <ChevronRight size={11} strokeWidth={1.5} aria-hidden />
                    )}
                  </button>
                  {showArchived && (
                    <div className="mt-1">
                      {archivedLoading ? (
                        <p className="px-2 py-2 text-xs text-[var(--stage-text-tertiary)] select-none">
                          Loading…
                        </p>
                      ) : !archivedSessions || archivedSessions.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-[var(--stage-text-tertiary)] select-none">
                          No archived chats.
                        </p>
                      ) : (
                        archivedSessions.map((session) => (
                          <ArchivedSessionRow
                            key={session.id}
                            session={session}
                            onRestore={handleRestore}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Production group — collapsible deal header + nested thread rows
// ---------------------------------------------------------------------------

function ProductionGroupRow({
  group,
  currentSessionId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onDelete,
  onNewScopedChat,
  onPin,
  onUnpin,
  onArchive,
  onContinueInNewChat,
}: {
  group: ProductionGroup;
  currentSessionId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewScopedChat?: (args: { scopeType: 'deal' | 'event'; scopeEntityId: string }) => void;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onArchive?: (id: string) => void;
  onContinueInNewChat?: (id: string) => void;
}) {
  const containsActive = group.sessions.some((s) => s.id === currentSessionId);

  return (
    <div className="mb-0.5 group/deal">
      {/* Deal header row — click toggles collapse, hover reveals + */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer select-none',
          'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.03)]',
          'transition-colors duration-[80ms]',
          containsActive && 'text-[var(--stage-text-primary)]',
        )}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
      >
        <span className="shrink-0 text-[var(--stage-text-tertiary)]">
          {collapsed ? <ChevronRight size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
        </span>
        <span className="text-sm truncate flex-1 leading-tight">{truncate(group.title, MAX_TITLE_CHARS)}</span>

        {/* + New chat under this deal — hover-reveal */}
        {onNewScopedChat && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNewScopedChat({ scopeType: 'deal', scopeEntityId: group.scopeEntityId });
            }}
            className={cn(
              'shrink-0 p-1 rounded-[4px] opacity-0 group-hover/deal:opacity-100',
              'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
              'hover:bg-[oklch(1_0_0_/_0.08)] transition-[opacity,color,background-color] duration-[80ms]',
            )}
            aria-label={`New chat about ${group.title}`}
          >
            <Plus size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Nested thread rows */}
      {!collapsed && (
        <div className="ml-1 pl-2 border-l border-[oklch(1_0_0_/_0.05)]">
          {group.sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
              onSelect={onSelect}
              onDelete={onDelete}
              onPin={onPin}
              onUnpin={onUnpin}
              onArchive={onArchive}
              onContinueInNewChat={onContinueInNewChat}
              indented
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session row — individual thread
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
  onPin,
  onUnpin,
  onArchive,
  onContinueInNewChat,
  indented,
}: {
  session: SessionMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onArchive?: (id: string) => void;
  onContinueInNewChat?: (id: string) => void;
  indented: boolean;
}) {
  const label = sessionLabel(session);
  return (
    <div
      key={session.id}
      className={cn(
        'relative w-full text-left px-2.5 py-1.5 rounded-lg transition-colors duration-[80ms] group/item cursor-pointer',
        indented && 'pl-2.5',
        isActive
          ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)]',
      )}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(session.id); }}
      title={relativeTime(session.lastMessageAt)}
    >
      <div className="flex items-center gap-1.5">
        {session.isPinned && (
          <Pin size={10} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
        )}
        <p className="text-sm truncate leading-snug pr-6 flex-1">{label}</p>
      </div>

      <SessionOverflowMenu
        session={session}
        onDelete={onDelete}
        onPin={onPin}
        onUnpin={onUnpin}
        onArchive={onArchive}
        onContinueInNewChat={onContinueInNewChat}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overflow menu — pin / archive / continue / delete
//
// Replaces the old hover-only Trash2 icon. Field Expert recommendation:
// archive is the default destructive path (reversible), hard delete is
// behind a confirmation to prevent accidental loss.
// ---------------------------------------------------------------------------

function SessionOverflowMenu({
  session,
  onDelete,
  onPin,
  onUnpin,
  onArchive,
  onContinueInNewChat,
}: {
  session: SessionMeta;
  onDelete: (id: string) => void;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onArchive?: (id: string) => void;
  onContinueInNewChat?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape dismisses
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const scopedOnly = session.scopeType === 'deal' || session.scopeType === 'event';

  return (
    <div ref={menuRef} className="absolute top-1 right-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setConfirmingDelete(false);
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'p-1 rounded-[4px]',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
          'hover:bg-[oklch(1_0_0_/_0.08)] transition-[opacity,color,background-color] duration-[80ms]',
          open ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100',
        )}
      >
        <MoreHorizontal size={12} strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={STAGE_LIGHT}
            className={cn(
              'absolute right-0 top-full mt-1 z-30 min-w-44 rounded-md p-1',
              'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
              'shadow-lg text-xs',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pin / Unpin */}
            {session.isPinned
              ? onUnpin && (
                <MenuItem
                  icon={<PinOff size={11} strokeWidth={1.5} />}
                  label="Unpin"
                  onClick={() => { setOpen(false); onUnpin(session.id); }}
                />
              )
              : onPin && (
                <MenuItem
                  icon={<Pin size={11} strokeWidth={1.5} />}
                  label="Pin"
                  onClick={() => { setOpen(false); onPin(session.id); }}
                />
              )}

            {/* Continue in new chat — scoped only */}
            {scopedOnly && onContinueInNewChat && (
              <MenuItem
                icon={<GitBranch size={11} strokeWidth={1.5} />}
                label="Continue in new chat"
                onClick={() => { setOpen(false); onContinueInNewChat(session.id); }}
              />
            )}

            {/* Archive — soft delete */}
            {onArchive && (
              <MenuItem
                icon={<Archive size={11} strokeWidth={1.5} />}
                label="Archive"
                onClick={() => { setOpen(false); onArchive(session.id); }}
              />
            )}

            {/* Divider + destructive Delete with in-menu confirm */}
            <hr className="my-1 border-[var(--stage-edge-subtle)]" />
            {confirmingDelete ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="text-[var(--stage-text-secondary)] flex-1">Delete forever?</span>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setConfirmingDelete(false); onDelete(session.id); }}
                  className="px-1.5 py-0.5 rounded-[4px] text-[var(--color-unusonic-error)] hover:bg-[oklch(1_0_0_/_0.06)]"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-1.5 py-0.5 rounded-[4px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <MenuItem
                icon={<Trash2 size={11} strokeWidth={1.5} />}
                label="Delete forever…"
                tone="error"
                onClick={() => setConfirmingDelete(true)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'error';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
        'hover:bg-[var(--stage-surface)] transition-colors duration-[80ms]',
        tone === 'error'
          ? 'text-[var(--color-unusonic-error)]'
          : 'text-[var(--stage-text-secondary)]',
      )}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Archived row — compact, Restore-only
// ---------------------------------------------------------------------------

function ArchivedSessionRow({
  session,
  onRestore,
}: {
  session: SessionMeta;
  onRestore: (id: string) => void;
}) {
  const label = sessionLabel(session);
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md group/arc',
        'text-[var(--stage-text-tertiary)]',
      )}
      title={session.scopeEntityTitle ?? undefined}
    >
      <p className="text-xs truncate flex-1 leading-snug italic">{label}</p>
      <button
        type="button"
        onClick={() => onRestore(session.id)}
        aria-label="Restore"
        title="Restore"
        className={cn(
          'shrink-0 p-1 rounded-[4px] opacity-0 group-hover/arc:opacity-100',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
          'hover:bg-[oklch(1_0_0_/_0.06)] transition-[opacity,color,background-color] duration-[80ms]',
        )}
      >
        <ArchiveRestore size={11} strokeWidth={1.5} />
      </button>
    </div>
  );
}
