'use server';

import { createClient } from '@/shared/api/supabase/server';
import type { AionMessageContent } from '../lib/aion-chat-types';

// =============================================================================
// Types
// =============================================================================

export type DbSessionMeta = {
  id: string;
  preview: string | null;
  created_at: string;
  updated_at: string;
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

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_sessions')
    .select('id, preview, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };
  return { success: true, sessions: (data ?? []) as DbSessionMeta[] };
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
