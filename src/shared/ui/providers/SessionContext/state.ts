'use client';

/**
 * SessionContext — pure state-shape helpers + localStorage cache utilities.
 *
 * Extracted from the original monolithic SessionContext.tsx (Phase 0.5
 * client-component split). These are stateless functions over the
 * SessionMeta + Message types — no React, no closures over Provider state.
 * The Provider imports them and wires them into setState callbacks.
 */

import type { DbSessionMeta } from '@/app/(dashboard)/(features)/aion/actions/aion-session-actions';
import { MAX_CACHED_SESSIONS, type SessionMeta } from './types';

/**
 * Factory for optimistic general-chat SessionMeta rows inserted before the
 * server authoritative row arrives. Used across the new-chat, resume, and
 * legacy-hydrate paths so the SessionMeta shape stays in one place.
 */
export function buildGeneralSessionMeta(id: string, now: number, preview = ''): SessionMeta {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    preview,
    title: null,
    scopeType: 'general',
    scopeEntityId: null,
    scopeEntityTitle: null,
    scopeEntityEventDate: null,
    titleLocked: false,
    isPinned: false,
    pinnedAt: null,
    pinned: false,
  };
}

export function dbSessionToMeta(db: DbSessionMeta): SessionMeta {
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
    scopeEntityEventDate: db.scope_entity_event_date,
    titleLocked: db.title_locked,
    isPinned: db.is_pinned,
    pinnedAt: db.pinned_at ? new Date(db.pinned_at).getTime() : null,
    pinned: db.pinned,
  };
}

/** Prune localStorage to keep only the N most recent sessions' messages */
export function pruneLocalStorage(
  sessions: SessionMeta[],
  storageMessagesKey: (id: string) => string,
) {
  if (sessions.length <= MAX_CACHED_SESSIONS) return;
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const toRemove = sorted.slice(MAX_CACHED_SESSIONS);
  for (const s of toRemove) {
    try {
      window.localStorage.removeItem(storageMessagesKey(s.id));
    } catch {
      /* ignore */
    }
  }
}
