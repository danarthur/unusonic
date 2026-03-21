'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export interface WorkspaceSkillPreset {
  id: string;
  skill_tag: string;
  sort_order: number;
}

/**
 * Fetch the curated skill tag presets for a workspace.
 * Used in MemberDetailSheet (quick-pick suggestions) and the roster settings panel.
 */
export async function getWorkspaceSkillPresets(
  workspaceId: string
): Promise<WorkspaceSkillPreset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .select('id, skill_tag, sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .order('skill_tag');

  return data ?? [];
}
