'use client';

/**
 * SessionContext — session-management actions.
 *
 * Extracted from the original monolithic SessionContext.tsx (Phase 0.5
 * client-component split). These are factory functions: each takes the
 * Provider's setters/refs as a `deps` bag and returns the action closure.
 * The Provider wraps them in `useCallback` to keep referential identity
 * stable across renders.
 *
 * Why factories instead of free functions? Two reasons:
 *   1. The Provider owns React state — the actions must close over the
 *      `setSessions` / `setMessages` setters that React gave us, not over
 *      module-scope mutables.
 *   2. The deps bag pattern keeps the Provider's `useCallback` array
 *      readable: `useCallback(makeFoo({...deps}), [deps...])` instead of a
 *      150-line inline body.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  archiveSession as archiveSessionAction,
  createNewScopedSession as createNewScopedSessionAction,
  pinSession as pinSessionAction,
  unpinSession as unpinSessionAction,
  continueSessionInNewChat as continueSessionInNewChatAction,
  resumeOrCreateSession,
  getSessionMessages,
} from '@/app/(dashboard)/(features)/aion/actions/aion-session-actions';
import type { Message, SessionMeta, StorageKeys } from './types';
import { buildGeneralSessionMeta } from './state';

// ── openScopedSession ──────────────────────────────────────────────────────

export type OpenScopedSessionDeps = {
  storage: StorageKeys;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionMeta[]>>;
};

export function makeOpenScopedSession(deps: OpenScopedSessionDeps) {
  return async ({
    workspaceId,
    scopeType,
    scopeEntityId,
    title,
  }: {
    workspaceId: string;
    scopeType: 'deal' | 'event';
    scopeEntityId: string;
    title?: string | null;
  }): Promise<string | null> => {
    const result = await resumeOrCreateSession(workspaceId, scopeType, scopeEntityId, title ?? null);
    if (!result.success) {
      console.error('[SessionContext] resumeOrCreateSession failed:', result.error);
      return null;
    }
    const resolvedId = result.sessionId;

    // Select the session (lazy-load of messages happens via the existing
    // effect that keys on sessionId).
    window.localStorage.setItem(deps.storage.currentSessionKey, resolvedId);
    deps.setSessionId(resolvedId);

    // Inject into local sessions if not already present. We create a minimal
    // SessionMeta with the known scope fields — the sidebar will re-hydrate
    // with the authoritative row (including any stored title/preview) on the
    // next getSessionList refetch.
    deps.setSessions((prev) => {
      if (prev.some((s) => s.id === resolvedId)) return prev;
      const now = Date.now();
      return [
        ...prev,
        {
          id: resolvedId,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          preview: '',
          title: title ?? null,
          scopeType,
          scopeEntityId,
          // Optimistic: use the caller-provided title as the scope entity
          // title so the sidebar group header renders correctly before the
          // next getSessionList refetch (the caller passes the live deal
          // title from deal-lens). Server-side enrichment will overwrite on
          // the next full hydrate if the deal is renamed.
          scopeEntityTitle: title ?? null,
          scopeEntityEventDate: null,
          titleLocked: false,
          isPinned: false,
          pinnedAt: null,
          pinned: false,
        },
      ];
    });
    return resolvedId;
  };
}

// ── createNewScopedChat ────────────────────────────────────────────────────

export type CreateNewScopedChatDeps = {
  storage: StorageKeys;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

export function makeCreateNewScopedChat(deps: CreateNewScopedChatDeps) {
  return async ({
    workspaceId,
    scopeType,
    scopeEntityId,
    title,
  }: {
    workspaceId: string;
    scopeType: 'deal' | 'event';
    scopeEntityId: string;
    title?: string | null;
  }): Promise<string | null> => {
    const result = await createNewScopedSessionAction(workspaceId, scopeType, scopeEntityId, title ?? null);
    if (!result.success) {
      console.error('[SessionContext] createNewScopedSession failed:', result.error);
      return null;
    }
    const newId = result.sessionId;
    window.localStorage.setItem(deps.storage.currentSessionKey, newId);
    deps.setSessionId(newId);
    deps.setMessages([]);
    deps.setSessions((prev) => {
      if (prev.some((s) => s.id === newId)) return prev;
      const now = Date.now();
      return [
        ...prev,
        {
          id: newId,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          preview: '',
          // Thread title starts null for brand-new sessions — the title
          // generator will populate after the first assistant turn.
          title: null,
          scopeType,
          scopeEntityId,
          // Optimistic: caller-provided title becomes the scope entity title
          // (deal title) for sidebar grouping. See openScopedSession for the
          // same pattern + rationale.
          scopeEntityTitle: title ?? null,
          scopeEntityEventDate: null,
          titleLocked: false,
          isPinned: false,
          pinnedAt: null,
          pinned: false,
        },
      ];
    });
    return newId;
  };
}

// ── pinSession / unpinSession ──────────────────────────────────────────────

export type PinSessionDeps = {
  setSessions: Dispatch<SetStateAction<SessionMeta[]>>;
};

export function makePinSession(deps: PinSessionDeps) {
  return async (targetSessionId: string): Promise<void> => {
    const result = await pinSessionAction(targetSessionId);
    if (!result.success) {
      if (result.atCap) {
        // Dynamic import to avoid a hard dep on sonner in the provider.
        const { toast } = await import('sonner');
        toast.error('Pin cap reached — unpin an existing thread (max 3 per event).');
      } else {
        console.error('[SessionContext] pinSession failed:', result.error);
      }
      return;
    }
    // Optimistic: flip the local pin flag so the sidebar reflows without a
    // full session-list refetch. Server authoritative on next hydrate.
    deps.setSessions((prev) =>
      prev.map((s) => (s.id === targetSessionId ? { ...s, isPinned: true, pinnedAt: Date.now() } : s)),
    );
  };
}

export function makeUnpinSession(deps: PinSessionDeps) {
  return async (targetSessionId: string): Promise<void> => {
    const result = await unpinSessionAction(targetSessionId);
    if (!result.success) {
      console.error('[SessionContext] unpinSession failed:', result.error);
      return;
    }
    deps.setSessions((prev) =>
      prev.map((s) => (s.id === targetSessionId ? { ...s, isPinned: false, pinnedAt: null } : s)),
    );
  };
}

// ── continueSessionInNewChat ───────────────────────────────────────────────

export type ContinueSessionDeps = {
  storage: StorageKeys;
  sessions: SessionMeta[];
  setSessionId: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

export function makeContinueSessionInNewChat(deps: ContinueSessionDeps) {
  return async (sourceSessionId: string): Promise<string | null> => {
    const result = await continueSessionInNewChatAction(sourceSessionId);
    if (!result.success) {
      console.error('[SessionContext] continueSessionInNewChat failed:', result.error);
      return null;
    }
    const newId = result.sessionId;

    // Seed local sessions with an optimistic row for the new thread. Carry
    // the source's scope entity title so the sidebar groups it correctly
    // before the next getSessionList refetch.
    const source = deps.sessions.find((s) => s.id === sourceSessionId) ?? null;
    window.localStorage.setItem(deps.storage.currentSessionKey, newId);
    deps.setSessionId(newId);
    deps.setMessages([]);
    deps.setSessions((prev) => {
      if (prev.some((s) => s.id === newId)) return prev;
      const now = Date.now();
      return [
        ...prev,
        {
          id: newId,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          preview: '',
          title: source?.title ? `Continuing: ${source.title}` : 'Continuing thread',
          scopeType: source?.scopeType ?? 'deal',
          scopeEntityId: source?.scopeEntityId ?? null,
          scopeEntityTitle: source?.scopeEntityTitle ?? null,
          scopeEntityEventDate: source?.scopeEntityEventDate ?? null,
          titleLocked: false,
          isPinned: false,
          pinnedAt: null,
          pinned: false,
        },
      ];
    });
    return newId;
  };
}

// ── archiveSession / removeSession ─────────────────────────────────────────

export type ArchiveSessionDeps = {
  storage: StorageKeys;
  sessionId: string;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

export function makeArchiveSession(deps: ArchiveSessionDeps) {
  return async (targetSessionId: string): Promise<void> => {
    const result = await archiveSessionAction(targetSessionId);
    if (!result.success) {
      console.error('[SessionContext] archiveSession failed:', result.error);
      return;
    }

    // Drop from the local sessions array so the sidebar updates immediately
    // (the getSessionList query already filters archived_at IS NULL).
    deps.setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));

    // Leave localStorage messages in place — archival is reversible, unlike
    // removeSession's permanent deletion.

    // If archiving the active session, fall back to a new general chat so
    // the user isn't staring at a ghost thread.
    if (targetSessionId === deps.sessionId) {
      const newId = `chat-${crypto.randomUUID()}`;
      window.localStorage.setItem(deps.storage.currentSessionKey, newId);
      deps.setSessionId(newId);
      deps.setMessages([]);
      const now = Date.now();
      deps.setSessions((prev) => [...prev, buildGeneralSessionMeta(newId, now)]);
    }
  };
}

export function makeRemoveSession(deps: ArchiveSessionDeps) {
  return (targetSessionId: string): void => {
    deps.setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));
    // Clean up localStorage messages for this session
    try {
      window.localStorage.removeItem(deps.storage.messagesKey(targetSessionId));
    } catch {
      /* ignore */
    }
    // If deleting the current session, start a new one
    if (targetSessionId === deps.sessionId) {
      const newId = `chat-${crypto.randomUUID()}`;
      window.localStorage.setItem(deps.storage.currentSessionKey, newId);
      deps.setSessionId(newId);
      deps.setMessages([]);
      const now = Date.now();
      deps.setSessions((prev) => [...prev, buildGeneralSessionMeta(newId, now)]);
    }
    // Fire-and-forget DB deletion
    import('@/app/(dashboard)/(features)/aion/actions/aion-session-actions')
      .then((mod) => mod.deleteSession(targetSessionId))
      .catch(() => {});
  };
}

// ── prefetchSession ────────────────────────────────────────────────────────

export type PrefetchSessionDeps = {
  storage: StorageKeys;
  sessionId: string;
};

/**
 * Hover prefetch — warms the session's localStorage cache so the next
 * selectSession() falls through the fast path. Skipped when we already
 * have the data (cache hit) or when the user is currently on the session
 * being prefetched (would clobber in-progress streaming). perf-patterns.md §4.
 */
export function makePrefetchSession(deps: PrefetchSessionDeps) {
  return (targetSessionId: string): void => {
    if (targetSessionId === deps.sessionId) return; // already current
    try {
      if (window.localStorage.getItem(deps.storage.messagesKey(targetSessionId))) {
        return; // already cached
      }
    } catch {
      /* localStorage blocked — fall through to fetch anyway */
    }

    getSessionMessages(targetSessionId)
      .then((result) => {
        if (!result.success || result.messages.length === 0) return;
        const loaded: Message[] = result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          ...(m.structured_content ? { structured: m.structured_content } : {}),
        }));
        try {
          window.localStorage.setItem(deps.storage.messagesKey(targetSessionId), JSON.stringify(loaded));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* DB unavailable — silent no-op */
      });
  };
}
