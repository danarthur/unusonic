'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ArchiveDealResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Archives a deal by setting archived_at to the current timestamp.
 * Archived deals are excluded from the CRM stream entirely.
 * Ownership is verified via workspace_id before any write.
 */
export async function archiveDeal(dealId: string): Promise<ArchiveDealResult> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace.' };
    }

    const supabase = await createClient();

    // Verify the deal belongs to this workspace
    const { data: deal, error: lookupError } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (lookupError) {
      console.error('[CRM] archiveDeal lookup error:', lookupError.message);
      return { success: false, error: lookupError.message };
    }

    if (!deal) {
      return { success: false, error: 'Not authorised' };
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', dealId);

    if (updateError) {
      console.error('[CRM] archiveDeal update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to archive deal';
    console.error('[CRM] archiveDeal unexpected:', err);
    return { success: false, error: message };
  }
}
