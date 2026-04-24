'use server';

import { createClient } from '@/shared/api/supabase/server';
import type { AionMessageContent } from '../lib/aion-chat-types';

// =============================================================================
// Types
// =============================================================================

export type DbSessionMeta = {
  id: string;
  preview: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  /** Last message write timestamp (column added 20260512000300). Drives
   *  sidebar sort within a scope group. Falls back to updated_at on rows
   *  predating the migration — server query backfills the nulls. */
  last_message_at: string;
  /** Session scope added in migration 20260512000100. `'general'` for open-ended
   *  chats from the Aion tab; `'deal'` when the session is pinned to a CRM deal;
   *  `'event'` reserved for Phase 2+. */
  scope_type: 'general' | 'deal' | 'event';
  /** FK to the scope subject. NULL for general, deal_id for scope='deal',
   *  event_id for scope='event'. */
  scope_entity_id: string | null;
  /** Display title of the scope entity (e.g. "Ally & Emily Wedding"). Pulled
   *  live on each list fetch — joining with public.deals server-side — so
   *  the sidebar group header never goes stale after a deal rename.
   *  Column added 20260512000300 (multi-thread pivot). */
  scope_entity_title: string | null;
  /** True pin with a 3-per-scope cap. Shown before unpinned within each group. */
  is_pinned: boolean;
  pinned_at: string | null;
  /** True when the user has explicitly renamed the thread. The title-
   *  generator respects this and never overwrites. */
  title_locked: boolean;
  /** Legacy per-session pin column, pre-20260512000300. Kept for backward
   *  compat with existing UI code; new work should read `is_pinned`. */
  pinned: boolean;
  /** Soft delete marker. getSessionList filters this out. */
  archived_at: string | null;
};

export type DbMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  structured_content: AionMessageContent[] | null;
  created_at: string;
};

// =============================================================================
// Session list — user's sessions in a workspace, ordered by recency
// =============================================================================

export async function getSessionList(
  workspaceId: string,
): Promise<{ success: true; sessions: DbSessionMeta[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Cast via `as any` because src/types/supabase.ts has stale generated types
  // for the scope columns (added 20260512000100) and the multi-thread columns
  // (added 20260512000300). Cortex is exposed through PostgREST but the
  // generated type graph is stale — matches the repo-wide pattern.
  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_sessions')
    .select(
      'id, preview, title, created_at, updated_at, last_message_at, scope_type, scope_entity_id, pinned, is_pinned, pinned_at, title_locked, archived_at',
    )
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('is_pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(80);

  if (error) return { success: false, error: error.message };
  const rawSessions = (data ?? []) as Array<Omit<DbSessionMeta, 'scope_entity_title'>>;

  // Enrich deal-scoped sessions with the live deal title so the sidebar
  // group header stays fresh after renames. One batch query, zero N+1.
  const dealIds = Array.from(
    new Set(
      rawSessions
        .filter((s) => s.scope_type === 'deal' && s.scope_entity_id)
        .map((s) => s.scope_entity_id as string),
    ),
  );

  const dealTitleById = new Map<string, string | null>();
  if (dealIds.length > 0) {
    const { data: dealRows } = await supabase
      .from('deals')
      .select('id, title')
      .in('id', dealIds)
      .eq('workspace_id', workspaceId);
    for (const d of (dealRows ?? []) as Array<{ id: string; title: string | null }>) {
      dealTitleById.set(d.id, d.title);
    }
  }

  const sessions: DbSessionMeta[] = rawSessions.map((s) => ({
    ...s,
    scope_entity_title:
      s.scope_type === 'deal' && s.scope_entity_id
        ? dealTitleById.get(s.scope_entity_id) ?? null
        : null,
  }));

  return { success: true, sessions };
}

// =============================================================================
// Session messages — all messages for a session (RLS enforces ownership)
// =============================================================================

export async function getSessionMessages(
  sessionId: string,
): Promise<{ success: true; messages: DbMessage[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_messages')
    .select('id, role, content, structured_content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, messages: (data ?? []) as DbMessage[] };
}

// =============================================================================
// Create session — accepts client-generated UUID to avoid race conditions
// =============================================================================

export async function createSession(
  workspaceId: string,
  id?: string,
  preview?: string,
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { data, error } = await system.schema('cortex').rpc('create_aion_session', {
      p_workspace_id: workspaceId,
      p_user_id: user.id,
      ...(id ? { p_id: id } : {}),
      ...(preview ? { p_preview: preview } : {}),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, sessionId: data as string };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Save message — fire-and-forget from the client
// =============================================================================

export async function saveMessage(
  sessionId: string,
  role: string,
  content: string,
  structured?: AionMessageContent[],
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { error } = await system.schema('cortex').rpc('save_aion_message', {
      p_session_id: sessionId,
      p_role: role,
      p_content: content,
      p_structured_content: structured ? JSON.stringify(structured) : null,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Resume or create scope-linked session — wraps resume_or_create_aion_session
//
// Used by:
//   - Deal card entry (scopeType='deal', scopeEntityId=dealId) — opens the
//     user's existing deal-scoped session or creates a fresh one.
//   - Future event-scope surfaces (scopeType='event') — currently rejected by
//     the RPC until Phase 2 wires them up.
//
// General-scope chats use the simpler createSession path above, which
// generates a client-side UUID and avoids the extra round-trip. This RPC
// returns the server-assigned id because the resume case needs to look up
// whatever id is already stored.
// =============================================================================

export async function resumeOrCreateSession(
  workspaceId: string,
  scopeType: 'general' | 'deal' | 'event',
  scopeEntityId?: string | null,
  title?: string | null,
): Promise<{ success: true; sessionId: string; isNew: boolean } | { success: false; error: string }> {
  // Use the authed user client — the RPC relies on auth.uid() for ownership
  // and scope-entity workspace checks. Calling it via the system client would
  // return NULL from auth.uid() and the RPC would throw 'Not authorized'.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { data, error } = await supabase.schema('cortex').rpc('resume_or_create_aion_session', {
      p_workspace_id: workspaceId,
      p_scope_type: scopeType,
      p_scope_entity_id: scopeEntityId ?? null,
      p_title: title ?? null,
    });
    if (error) return { success: false, error: error.message };
    // RPC returns TABLE(session_id uuid, is_new boolean) — supabase-js surfaces
    // this as an array with one row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.session_id) {
      return { success: false, error: 'Unexpected empty RPC response' };
    }
    return {
      success: true,
      sessionId: row.session_id as string,
      isNew: Boolean(row.is_new),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Create a NEW scope-linked session — always creates, never resumes.
// Paired with resumeOrCreateSession: that one is for the deal-card mount
// (resume most-recent), this one is for the "+ New chat" button in the
// sidebar / scope header (force a fresh thread under the same scope).
// =============================================================================

export async function createNewScopedSession(
  workspaceId: string,
  scopeType: 'general' | 'deal' | 'event',
  scopeEntityId?: string | null,
  title?: string | null,
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { data, error } = await supabase.schema('cortex').rpc('create_new_aion_session_for_scope', {
      p_workspace_id: workspaceId,
      p_scope_type: scopeType,
      p_scope_entity_id: scopeEntityId ?? null,
      p_title: title ?? null,
    });
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Unexpected empty RPC response' };
    return { success: true, sessionId: data as string };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Pin / unpin — max 3 pinned per scope (enforced by the RPC)
// =============================================================================

export async function pinSession(
  sessionId: string,
): Promise<{ success: true } | { success: false; error: string; atCap?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { error } = await supabase.schema('cortex').rpc('pin_aion_session', {
      p_session_id: sessionId,
    });
    if (error) {
      // Postgres 23505 = pin cap reached (from the RPC's RAISE EXCEPTION)
      if (error.code === '23505') {
        return { success: false, error: error.message, atCap: true };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function unpinSession(
  sessionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { error } = await supabase.schema('cortex').rpc('unpin_aion_session', {
      p_session_id: sessionId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Continue a session in a fresh thread — Field Expert's "merge escape valve"
//
// Spawns a new session under the same scope, titled "Continuing: <source>"
// so the lineage is visible in the sidebar. Phase 1 leaves summary generation
// out; users can paste context or ask Aion to pick up. Phase 2 will seed the
// new thread with a Haiku-synthesized summary of the source.
// =============================================================================

export async function continueSessionInNewChat(
  sourceSessionId: string,
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    // Read the source for its scope + title.
    const { data: source, error: readErr } = await supabase
      .schema('cortex')
      .from('aion_sessions')
      .select('workspace_id, scope_type, scope_entity_id, title')
      .eq('id', sourceSessionId)
      .maybeSingle();

    if (readErr || !source) {
      return { success: false, error: readErr?.message ?? 'Source session not found' };
    }

    const src = source as {
      workspace_id: string;
      scope_type: 'general' | 'deal' | 'event';
      scope_entity_id: string | null;
      title: string | null;
    };

    // General-scope "continue" isn't wired yet (no UI path); route only deals
    // through this pathway to match what the sidebar surfaces.
    if (src.scope_type === 'general') {
      return { success: false, error: 'Continue-in-new-chat requires a scoped source' };
    }

    const newTitle = src.title ? `Continuing: ${src.title}` : 'Continuing thread';

    const { data: newSessionId, error: createErr } = await supabase
      .schema('cortex')
      .rpc('create_new_aion_session_for_scope', {
        p_workspace_id: src.workspace_id,
        p_scope_type: src.scope_type,
        p_scope_entity_id: src.scope_entity_id,
        p_title: newTitle,
      });

    if (createErr || !newSessionId) {
      return { success: false, error: createErr?.message ?? 'Failed to create continuation' };
    }

    return { success: true, sessionId: newSessionId as string };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Archived list — separate read path for the "View archived" sidebar surface
// =============================================================================

export async function getArchivedSessionList(
  workspaceId: string,
): Promise<{ success: true; sessions: DbSessionMeta[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_sessions')
    .select(
      'id, preview, title, created_at, updated_at, last_message_at, scope_type, scope_entity_id, pinned, is_pinned, pinned_at, title_locked, archived_at',
    )
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(80);

  if (error) return { success: false, error: error.message };
  const rawSessions = (data ?? []) as Array<Omit<DbSessionMeta, 'scope_entity_title'>>;

  const dealIds = Array.from(
    new Set(
      rawSessions
        .filter((s) => s.scope_type === 'deal' && s.scope_entity_id)
        .map((s) => s.scope_entity_id as string),
    ),
  );

  const dealTitleById = new Map<string, string | null>();
  if (dealIds.length > 0) {
    const { data: dealRows } = await supabase
      .from('deals')
      .select('id, title')
      .in('id', dealIds)
      .eq('workspace_id', workspaceId);
    for (const d of (dealRows ?? []) as Array<{ id: string; title: string | null }>) {
      dealTitleById.set(d.id, d.title);
    }
  }

  const sessions: DbSessionMeta[] = rawSessions.map((s) => ({
    ...s,
    scope_entity_title:
      s.scope_type === 'deal' && s.scope_entity_id
        ? dealTitleById.get(s.scope_entity_id) ?? null
        : null,
  }));

  return { success: true, sessions };
}

// Un-archive via cortex.unarchive_aion_session RPC (20260512000400). Cortex
// is write-protected — direct UPDATEs are blocked, so restore routes through
// SECURITY DEFINER.
export async function unarchiveSession(
  sessionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { error } = await supabase.schema('cortex').rpc('unarchive_aion_session', {
      p_session_id: sessionId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Archive session — soft delete via archive_aion_session
//
// The existing deleteSession hard-deletes the row. archiveSession stamps
// archived_at so the conversation stays readable in history while dropping
// out of the sidebar (getSessionList filters archived_at IS NULL).
// =============================================================================

export async function archiveSession(
  sessionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Same rule as resumeOrCreateSession — archive_aion_session gates on
  // auth.uid() == session.user_id, so the user's authed client is required.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { error } = await supabase.schema('cortex').rpc('archive_aion_session', {
      p_session_id: sessionId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Delete session — ownership enforced by the RPC
// =============================================================================

export async function deleteSession(
  sessionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { data, error } = await system.schema('cortex').rpc('delete_aion_session', {
      p_session_id: sessionId,
      p_user_id: user.id,
    });
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Session not found or not owned by you' };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Save message feedback — thumbs up/down stored on the session's feedback JSONB
// =============================================================================

export async function saveMessageFeedback(
  sessionId: string,
  messageId: string,
  feedback: 'up' | 'down' | null,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();

    // Read current feedback JSONB, merge, write back
    const { data } = await system.schema('cortex').from('aion_sessions')
      .select('feedback').eq('id', sessionId).maybeSingle();
    const existing = (data?.feedback as Record<string, string> | null) ?? {};
    if (feedback === null) {
      delete existing[messageId];
    } else {
      existing[messageId] = feedback;
    }
    await system.schema('cortex').from('aion_sessions')
      .update({ feedback: existing }).eq('id', sessionId);
  } catch {
    // Fire-and-forget — don't break the UI for feedback
  }
}
