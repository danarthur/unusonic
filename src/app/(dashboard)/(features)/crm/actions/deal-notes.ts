'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';
import { upsertEmbedding, deleteEmbedding, observeUpsert, buildContextHeader } from '@/app/api/aion/lib/embeddings';

// =============================================================================
// Types
// =============================================================================

export type DealNoteAttachment = {
  name: string;
  path: string;
  size: number;
  type: string;
};

export type PhaseTag = 'deal' | 'plan' | 'ledger' | 'general';

export type DealNoteEntry = {
  id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_avatar_url: string | null;
  is_own: boolean;
  attachments: DealNoteAttachment[];
  pinned_at: string | null;
  phase_tag: PhaseTag;
};

// =============================================================================
// getDealNotes — returns all notes for a deal, newest first
// =============================================================================

export async function getDealNotes(
  dealId: string,
  phaseFilter?: PhaseTag | null,
): Promise<DealNoteEntry[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? '';

  let query = supabase
    .schema('ops')
    .from('deal_notes')
    .select('id, content, created_at, author_user_id, attachments, pinned_at, phase_tag')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Filter by phase if requested (null/undefined = show all).
  // 'general' notes always included — they're shared across all phases.
  if (phaseFilter) {
    query = query.in('phase_tag', [phaseFilter, 'general']);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  // Batch-resolve author profiles
  const authorIds = [...new Set((data as { author_user_id: string }[]).map((n) => n.author_user_id))];
  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', authorIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
    }
  }

  const mapped = (data as { id: string; content: string; created_at: string; author_user_id: string; attachments: unknown; pinned_at: string | null; phase_tag: string | null }[]).map((n) => {
    const profile = profileMap.get(n.author_user_id);
    const rawAttachments = Array.isArray(n.attachments) ? n.attachments : [];
    return {
      id: n.id,
      content: n.content,
      created_at: n.created_at,
      author_name: profile?.full_name ?? 'Team member',
      author_avatar_url: profile?.avatar_url ?? null,
      is_own: n.author_user_id === currentUserId,
      attachments: rawAttachments as DealNoteAttachment[],
      pinned_at: n.pinned_at,
      phase_tag: (n.phase_tag as PhaseTag) ?? 'general',
    };
  });

  // Pinned notes first, then chronological
  mapped.sort((a, b) => {
    if (a.pinned_at && !b.pinned_at) return -1;
    if (!a.pinned_at && b.pinned_at) return 1;
    return 0; // preserve existing created_at desc order within each group
  });

  return mapped;
}

// =============================================================================
// addDealNote — creates a new timestamped note
// =============================================================================

export async function addDealNote(
  dealId: string,
  content: string,
  attachments?: DealNoteAttachment[],
  phaseTag?: PhaseTag,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = z.object({
    dealId: z.string().uuid(),
    content: z.string().min(1).max(5000),
  }).safeParse({ dealId, content });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Verify deal belongs to workspace
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!deal) return { success: false, error: 'Deal not found' };


  const { data, error } = await supabase
    .schema('ops')
    .from('deal_notes')
    .insert({
      deal_id: dealId,
      workspace_id: workspaceId,
      author_user_id: user.id,
      content: content.trim(),
      attachments: attachments && attachments.length > 0 ? attachments : [],
      phase_tag: phaseTag ?? 'general',
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  // Fire-and-forget: embed the note for Aion RAG. observeUpsert handles
  // failure logging (Sprint 0 removed the throw semantics — .catch() was dead).
  const noteId = (data as { id: string }).id;
  const { data: dealRow } = await supabase.from('deals').select('title').eq('id', dealId).maybeSingle();
  const header = buildContextHeader('deal_note', { dealTitle: (dealRow as any)?.title });
  observeUpsert(
    upsertEmbedding(workspaceId, 'deal_note', noteId, content.trim(), header),
    { sourceType: 'deal_note', sourceId: noteId },
  );

  revalidatePath('/crm');
  return { success: true, id: noteId };
}

// =============================================================================
// deleteDealNote — author can delete own notes; owner/admin can delete any
// =============================================================================

export async function deleteDealNote(
  noteId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(noteId);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Check if user is owner/admin (can delete any note in workspace)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (membership as { role?: string } | null)?.role;
  const isAdmin = role === 'owner' || role === 'admin';

   
  let query = supabase
    .schema('ops')
    .from('deal_notes')
    .delete({ count: 'exact' })
    .eq('id', noteId)
    .eq('workspace_id', workspaceId);

  // Non-admins can only delete their own notes
  if (!isAdmin) {
    query = query.eq('author_user_id', user.id);
  }

  const { error, count } = await query;

  if (error) return { success: false, error: error.message };
  if (count === 0) return { success: false, error: 'Note not found or not yours' };

  // Fire-and-forget: remove embedding
  deleteEmbedding('deal_note', noteId).catch(console.error);

  return { success: true };
}

// =============================================================================
// getAttachmentUrl — generates a signed download URL for a private attachment
// =============================================================================

export async function getAttachmentUrl(
  path: string,
): Promise<{ url: string } | { url: null; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { url: null, error: 'Not authorised' };

  // Verify the path belongs to the user's workspace
  if (!path.startsWith(`${workspaceId}/`)) {
    return { url: null, error: 'Not authorised' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('deal-attachments')
    .createSignedUrl(path, 3600); // 1 hour

  if (error || !data?.signedUrl) return { url: null, error: error?.message ?? 'Failed to generate URL' };
  return { url: data.signedUrl };
}

// =============================================================================
// togglePinNote — pin or unpin a note
// =============================================================================

export async function togglePinNote(
  noteId: string,
  pin: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(noteId);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('deal_notes')
    .update({ pinned_at: pin ? new Date().toISOString() : null })
    .eq('id', noteId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// =============================================================================
// editDealNote — update note content (own notes only, or admin)
// =============================================================================

export async function editDealNote(
  noteId: string,
  content: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.object({
    noteId: z.string().uuid(),
    content: z.string().min(1).max(5000),
  }).safeParse({ noteId, content });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (membership as { role?: string } | null)?.role;
  const isAdmin = role === 'owner' || role === 'admin';

  let query = supabase
    .schema('ops')
    .from('deal_notes')
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('workspace_id', workspaceId);

  if (!isAdmin) {
    query = query.eq('author_user_id', user.id);
  }

  const { error } = await query;
  if (error) return { success: false, error: error.message };

  // Fire-and-forget: re-embed the updated note. observeUpsert handles
  // failure logging.
  observeUpsert(
    upsertEmbedding(workspaceId, 'deal_note', noteId, content.trim()),
    { sourceType: 'deal_note', sourceId: noteId },
  );

  return { success: true };
}
