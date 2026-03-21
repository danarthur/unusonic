'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type UpdateGearItemStatusResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Updates the status of a single ops.event_gear_items row.
 * Workspace scoping enforced: workspace_id must match active workspace.
 */
export async function updateGearItemStatus(
  gearItemId: string,
  status: string
): Promise<UpdateGearItemStatusResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error } = await db
    .schema('ops')
    .from('event_gear_items')
    .update({
      status,
      status_updated_at: new Date().toISOString(),
    })
    .eq('id', gearItemId)
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
