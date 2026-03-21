/**
 * Sales feature – Workspace tags (Notion-style controlled customization).
 * @module features/sales/api/workspace-tag-actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface WorkspaceTag {
  id: string;
  workspace_id: string;
  label: string;
  color: string;
}

export interface GetWorkspaceTagsResult {
  tags: WorkspaceTag[];
  error?: string;
}

export interface CreateWorkspaceTagResult {
  tag: WorkspaceTag | null;
  error?: string;
}

const SIGNAL_TAG_COLORS = [
  'blue-400',
  'emerald-400',
  'amber-400',
  'rose-400',
  'violet-400',
  'teal-400',
  'orange-400',
  'fuchsia-400',
] as const;

function pickRandomColor(): string {
  return SIGNAL_TAG_COLORS[Math.floor(Math.random() * SIGNAL_TAG_COLORS.length)];
}

/** Fetch all workspace tags (for type-ahead and Smart Tag Input). */
export async function getWorkspaceTags(workspaceId: string): Promise<GetWorkspaceTagsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_tags')
    .select('id, workspace_id, label, color')
    .eq('workspace_id', workspaceId)
    .order('label', { ascending: true });

  if (error) {
    return { tags: [], error: error.message };
  }
  return { tags: (data ?? []) as WorkspaceTag[] };
}

/** Get or create a tag by label (case-insensitive). Returns existing or new tag. */
export async function createWorkspaceTag(
  workspaceId: string,
  label: string,
  color?: string
): Promise<CreateWorkspaceTagResult> {
  const supabase = await createClient();
  const trimmed = label.trim();
  if (!trimmed) {
    return { tag: null, error: 'Label is required.' };
  }

  const existing = await supabase
    .from('workspace_tags')
    .select('id, workspace_id, label, color')
    .eq('workspace_id', workspaceId)
    .ilike('label', trimmed)
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return { tag: existing.data as WorkspaceTag };
  }

  const colorVal = color ?? pickRandomColor();
  const { data, error } = await supabase
    .from('workspace_tags')
    .insert({
      workspace_id: workspaceId,
      label: trimmed,
      color: colorVal,
    })
    .select('id, workspace_id, label, color')
    .single();

  if (error) {
    return { tag: null, error: error.message };
  }
  return { tag: data as WorkspaceTag };
}
