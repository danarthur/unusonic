'use client';

/**
 * SessionContext — public types.
 *
 * Extracted from the original monolithic SessionContext.tsx (Phase 0.5
 * client-component split). External callers continue importing `Message`
 * and `SessionMeta` from `@/shared/ui/providers/SessionContext`; the
 * barrel re-exports them from here.
 */

import type {
  AionMessageContent,
  AionModelMode,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';

// Define the shape of a message
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachment?: string;
  structured?: AionMessageContent[];
  isError?: boolean;
  modelTier?: 'fast' | 'standard' | 'heavy';
  /**
   * Optional "thinking" preamble — text the model emits BEFORE calling its
   * first tool ("I'll search for that wedding deal"). Populated via the
   * server's `preamble:` stream channel, frozen on `preamble-end:`. The
   * renderer shows it as a muted collapsible header above `content`.
   * Absent on turns where no tool was called (the whole response is content).
   */
  preamble?: string;
};

export type SessionMeta = {
  id: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
  /** Last-message timestamp (ms epoch). Drives sidebar sort within a scope
   *  group. Bumped by save_aion_message alongside updated_at. */
  lastMessageAt: number;
  /** Thread title — auto-generated after the first assistant turn (3–6
   *  words, Title Case) OR set by the user. Starts as the scope entity
   *  name (e.g. deal title) until the title generator lands. */
  title: string | null;
  /** Session scope — drives sidebar grouping. */
  scopeType: 'general' | 'deal' | 'event';
  /** Scope subject id. NULL for general. */
  scopeEntityId: string | null;
  /** Display title of the scope entity (e.g. "Ally & Emily Wedding").
   *  Server enrichment — joined live from public.deals on every list fetch
   *  so a rename propagates immediately. NULL for general sessions. For
   *  event-scoped sessions this carries the deal-title provenance ("the
   *  thread started as this deal's chat"), matching the sidebar-subtitle
   *  "deal-title → event-date" shape in aion-event-scope-header-design.md §4.1. */
  scopeEntityTitle: string | null;
  /** For event-scoped sessions: ISO date of the event's starts_at, used for
   *  the sidebar subtitle formatted side. NULL for deal/general. */
  scopeEntityEventDate: string | null;
  /** True when the user has renamed — the title generator will never
   *  overwrite. */
  titleLocked: boolean;
  /** Multi-thread pin: max 3 per scope bucket. Pinned threads float to the
   *  top within each deal group. */
  isPinned: boolean;
  pinnedAt: number | null;
  /** Legacy boolean pin column from 20260512000100. Kept for backward
   *  compat with pre-multi-thread UI; new sort order uses `isPinned`. */
  pinned: boolean;
};

export interface SessionContextType {
  messages: Message[];
  sessions: SessionMeta[];
  currentSessionId: string;
  isLoading: boolean;
  /**
   * True while the post-`selectSession` DB fetch is in flight for a session
   * that wasn't in localStorage. Drives the streaming-first sibling-switch
   * pattern: ChatInterface renders a thread skeleton instead of the empty
   * landing screen during this window so the user doesn't see the (briefly)
   * empty `messages` array as a real "this session is empty" state.
   * See docs/reference/code/perf-patterns.md §14 (planned) and
   * docs/reference/load-time-strategy.md §8.
   */
  isLoadingSession: boolean;
  /** ID of the message currently being streamed (null when not streaming) */
  streamingMessageId: string | null;
  /** Label of the tool currently being executed (null when idle) */
  activeToolLabel: string | null;
  setIsLoading: (loading: boolean) => void;
  viewState: 'overview' | 'chat';
  setViewState: (state: 'overview' | 'chat') => void;
  sendMessage: (input: { text?: string; file?: File; audioBlob?: Blob }) => Promise<void>;
  /** Send a text message through the Aion chat route (streaming SSE). */
  sendChatMessage: (input: { text: string; workspaceId: string }) => Promise<void>;
  /** Set the workspace ID for voice → chat routing. */
  setWorkspaceId: (id: string) => void;
  addMessage: (role: 'user' | 'assistant', content: string, structured?: AionMessageContent[]) => void;
  startNewChat: () => void;
  /** Open (resume if exists, else create) a scope-linked session. Used by
   *  the deal card to attach chat to a specific deal, and by future event
   *  surfaces. Returns the resolved session id, which is also set as the
   *  current session. */
  openScopedSession: (args: {
    workspaceId: string;
    scopeType: 'deal' | 'event';
    scopeEntityId: string;
    title?: string | null;
  }) => Promise<string | null>;
  /** Create a NEW scope-linked session — always creates, never resumes. Used
   *  by the "+ New chat" button in the sidebar + scope header to spawn a
   *  fresh thread under the same production. */
  createNewScopedChat: (args: {
    workspaceId: string;
    scopeType: 'deal' | 'event';
    scopeEntityId: string;
    title?: string | null;
  }) => Promise<string | null>;
  selectSession: (sessionId: string) => void;
  /**
   * Hover prefetch — fires getSessionMessages and writes the result to
   * localStorage so the next selectSession() resolves from cache instead of
   * paying the DB round-trip. Idempotent + safe to call concurrently;
   * silently no-ops if the session's messages are already cached.
   */
  prefetchSession: (sessionId: string) => void;
  /** Hard-delete — permanent removal. Existing Trash2 affordance in the sidebar. */
  removeSession: (sessionId: string) => void;
  /** Soft-delete — stamps archived_at, preserves history, drops from sidebar. */
  archiveSession: (sessionId: string) => Promise<void>;
  /** Pin a session (max 3 per scope). Surfaces pin failures via a toast so
   *  the caller doesn't need to inspect the promise resolve value. */
  pinSession: (sessionId: string) => Promise<void>;
  /** Unpin a session. */
  unpinSession: (sessionId: string) => Promise<void>;
  /** Spawn a fresh thread in the source session's scope, titled
   *  "Continuing: <source title>". Field Expert's merge-escape-valve.
   *  Returns the new session id (also selected as current) or null on error. */
  continueSessionInNewChat: (sourceSessionId: string) => Promise<string | null>;
  /** Edit a past user message and resend from that point */
  editAndResend: (msgId: string, newContent: string, workspaceId: string) => void;
  /** Retry the last failed assistant message */
  retryLastMessage: (errorMsgId: string, workspaceId: string) => void;
  /** Abort the current streaming request */
  cancelStreaming: () => void;
  hydrateSessions: (initial: SessionMeta[]) => void;
  /** Model mode: auto (intent-based), fast (Haiku), thinking (Sonnet+ with extended thinking) */
  modelMode: AionModelMode;
  setModelMode: (mode: AionModelMode) => void;
}

/** Storage key factory — single source of truth for localStorage namespacing. */
export type StorageKeys = {
  currentSessionKey: string;
  sessionsKey: string;
  messagesKey: (id: string) => string;
};

export const MAX_CACHED_SESSIONS = 5;
