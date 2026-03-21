'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// 'won' is intentionally excluded — only the handoff wizard may set that status
export type DealStatus = 'lost' | 'inquiry' | 'proposal' | 'contract_sent';

export type UpdateDealStatusResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Updates the status of a deal.
 * Ownership is verified via workspace_id before any write.
 */
export async function updateDealStatus(
  dealId: string,
  status: DealStatus
): Promise<UpdateDealStatusResult> {
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
      console.error('[CRM] updateDealStatus lookup error:', lookupError.message);
      return { success: false, error: lookupError.message };
    }

    if (!deal) {
      return { success: false, error: 'Not authorised' };
    }

    // Runtime guard — belt-and-suspenders; type system excludes 'won' but server actions receive untyped wire input
    if ((status as string) === 'won') {
      return { success: false, error: 'Use the handoff wizard to mark a deal as won.' };
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update({ status })
      .eq('id', dealId);

    if (updateError) {
      console.error('[CRM] updateDealStatus update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update deal status';
    console.error('[CRM] updateDealStatus unexpected:', err);
    return { success: false, error: message };
  }
}
