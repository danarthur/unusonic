'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export interface WorkspaceIndustryTag {
  id: string;
  tag: string;
  label: string;
  sort_order: number;
}

/**
 * Fetch the curated industry tag dictionary for a workspace.
 * Used in IndustryTagPicker (multi-select) and the Network Tags settings panel.
 */
export async function getWorkspaceIndustryTags(
  workspaceId: string
): Promise<WorkspaceIndustryTag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('workspace_industry_tags')
    .select('id, tag, label, sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .order('label');

  return data ?? [];
}
