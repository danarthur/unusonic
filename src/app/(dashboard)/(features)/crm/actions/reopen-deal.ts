'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ReopenDealResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Reopens a deal by resetting its status to 'inquiry' and clearing archived_at.
 * Moves the deal back into the CRM stream's Inquiry tab.
 * Ownership is verified via workspace_id before any write.
 */
export async function reopenDeal(dealId: string): Promise<ReopenDealResult> {
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
      console.error('[CRM] reopenDeal lookup error:', lookupError.message);
      return { success: false, error: lookupError.message };
    }

    if (!deal) {
      return { success: false, error: 'Not authorised' };
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update({ status: 'inquiry', archived_at: null })
      .eq('id', dealId);

    if (updateError) {
      console.error('[CRM] reopenDeal update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reopen deal';
    console.error('[CRM] reopenDeal unexpected:', err);
    return { success: false, error: message };
  }
}
