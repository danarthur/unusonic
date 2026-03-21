'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export interface WorkspaceJobTitle {
  id: string;
  title: string;
  sort_order: number;
}

/**
 * Fetch the curated job title options for a workspace.
 * Used in MemberDetailSheet (job title select) and AssignCrewSheet (primary filter).
 */
export async function getWorkspaceJobTitles(
  workspaceId: string
): Promise<WorkspaceJobTitle[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('workspace_job_titles')
    .select('id, title, sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .order('title');

  return data ?? [];
}
