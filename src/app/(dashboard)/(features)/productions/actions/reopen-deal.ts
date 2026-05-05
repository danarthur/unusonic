'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { resolveStageByTag } from '@/shared/lib/pipeline-stages/resolve-stage';

export type ReopenDealResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Reopens a deal by moving it back to the workspace's initial-contact stage
 * (tag `initial_contact`) and clearing archived_at.
 *
 * Phase 3i: writes stage_id directly; the BEFORE trigger derives status from
 * stage.kind (will be 'working'). The tag lookup makes this rename-resilient:
 * a workspace that renames "Inquiry" to "Lead" still reopens into the right
 * stage as long as the tag is preserved.
 *
 * Ownership is verified via workspace_id before any write.
 */
export async function reopenDeal(dealId: string): Promise<ReopenDealResult> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace.' };
    }

    const supabase = await createClient();

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

    // Phase 3i: resolve the workspace's initial-contact stage via tag.
    const initialStage = await resolveStageByTag(supabase, workspaceId, 'initial_contact');
    if (!initialStage) {
      return {
        success: false,
        error: 'No stage tagged initial_contact in this workspace\'s default pipeline.',
      };
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update({ stage_id: initialStage.stageId, archived_at: null })
      .eq('id', dealId);

    if (updateError) {
      console.error('[CRM] reopenDeal update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/productions');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reopen deal';
    console.error('[CRM] reopenDeal unexpected:', err);
    return { success: false, error: message };
  }
}
