'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type DeleteDealResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Permanently hard-deletes a deal.
 * Only callable for deals that have not been handed off to an ops.event
 * (enforced in the UI; this action trusts the workspace ownership check).
 * Ownership is verified via workspace_id before any write.
 */
export async function deleteDeal(dealId: string): Promise<DeleteDealResult> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace.' };
    }

    const supabase = await createClient();

    // Verify the deal belongs to this workspace and has not been handed off
    const { data: deal, error: lookupError } = await supabase
      .from('deals')
      .select('id, event_id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (lookupError) {
      console.error('[CRM] deleteDeal lookup error:', lookupError.message);
      return { success: false, error: lookupError.message };
    }

    if (!deal) {
      return { success: false, error: 'Not authorised' };
    }

    if (deal.event_id) {
      return { success: false, error: 'Cannot delete a deal that has been handed off to production.' };
    }

    const { error: deleteError } = await supabase
      .from('deals')
      .delete()
      .eq('id', dealId);

    if (deleteError) {
      console.error('[CRM] deleteDeal delete error:', deleteError.message);
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/productions');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete deal';
    console.error('[CRM] deleteDeal unexpected:', err);
    return { success: false, error: message };
  }
}
