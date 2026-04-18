'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { DealIds, EntityIds, type DealId, type EntityId } from '@/shared/types/branded-ids';
import { resolveStageByKind, resolveStageBySlug } from '@/shared/lib/pipeline-stages/resolve-stage';
import type { LostReason } from './get-deal';

// Standard statuses settable through normal flows (kept as the action's
// external interface — Prism dropdown still hands these in).
export type DealStatus = 'lost' | 'inquiry' | 'proposal' | 'contract_sent';
// Override statuses — bypasses system flows (DocuSeal, Stripe, handoff wizard)
export type DealStatusOverride = 'contract_signed' | 'deposit_received' | 'won';

export type UpdateDealStatusResult =
  | { success: true }
  | { success: false; error: string };

export type MarkAsLostInput = {
  lost_reason: LostReason;
  lost_to_competitor_name?: string | null;
};

/**
 * Updates the status of a deal.
 *
 * Phase 3i: resolves the legacy status slug to the workspace's stage_id (via
 * the default pipeline) and writes stage_id directly. The BEFORE trigger
 * (`public.sync_deal_status_from_stage`) derives deals.status = stage.kind.
 *
 * External API is unchanged — callers still pass a slug string like 'inquiry'
 * or 'won'. That keeps Prism, deal-lens, stream-card, and the Aion tool at
 * parity. When workspaces rename stages in a future phase, the dropdown will
 * hand in whatever slug the workspace's default pipeline uses; `resolveStageBySlug`
 * handles both stock slugs and workspace-renamed slugs uniformly.
 *
 * When marking as lost, requires a reason and optionally the competitor name.
 * When override=true, allows setting contract_signed/deposit_received/won
 * without running the normal system flows (for offline contracts, manual payments, etc.).
 * Ownership is verified via workspace_id before any write.
 */
export async function updateDealStatus(
  dealId: string,
  status: DealStatus | DealStatusOverride,
  lostInput?: MarkAsLostInput,
  override?: boolean
): Promise<UpdateDealStatusResult> {
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
      return { success: false, error: lookupError.message };
    }
    if (!deal) {
      return { success: false, error: 'Not authorised' };
    }

    const overrideStatuses: string[] = ['contract_signed', 'deposit_received', 'won'];
    if (overrideStatuses.includes(status) && !override) {
      return { success: false, error: 'Use the handoff wizard or system flows to set this status, or pass override=true to force it.' };
    }

    // Phase 3i: resolve the slug to a stage_id in the workspace's default
    // pipeline. 'won' / 'lost' resolve by kind (partial-unique indexes
    // guarantee exactly one per pipeline); working slugs resolve by slug.
    let resolvedStageId: string | null = null;
    if (status === 'won') {
      const won = await resolveStageByKind(supabase, workspaceId, 'won');
      resolvedStageId = won?.stageId ?? null;
    } else if (status === 'lost') {
      const lost = await resolveStageByKind(supabase, workspaceId, 'lost');
      resolvedStageId = lost?.stageId ?? null;
    } else {
      const match = await resolveStageBySlug(supabase, workspaceId, status);
      resolvedStageId = match?.stageId ?? null;
    }

    if (!resolvedStageId) {
      return {
        success: false,
        error: `No stage matching '${status}' in this workspace's default pipeline.`,
      };
    }

    const patch: {
      stage_id: string;
      won_at?: string;
      lost_reason?: string;
      lost_to_competitor_name?: string | null;
      lost_at?: string;
    } = { stage_id: resolvedStageId };

    if (status === 'won') {
      patch.won_at = new Date().toISOString();
    }

    if (status === 'lost') {
      if (!lostInput?.lost_reason) {
        return { success: false, error: 'A loss reason is required.' };
      }
      patch.lost_reason = lostInput.lost_reason;
      patch.lost_to_competitor_name = lostInput.lost_reason === 'competitor'
        ? (lostInput.lost_to_competitor_name?.trim() || null)
        : null;
      patch.lost_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update(patch)
      .eq('id', dealId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update deal status';
    return { success: false, error: message };
  }
}

/**
 * Assigns a directory entity as the deal owner.
 */
export async function assignDealOwner(
  rawDealId: string,
  rawOwnerEntityId: string | null
): Promise<UpdateDealStatusResult> {
  try {
    const dealId: DealId = DealIds.parse(rawDealId);
    const ownerEntityId: EntityId | null = rawOwnerEntityId ? EntityIds.parse(rawOwnerEntityId) : null;
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    const { data: deal } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!deal) return { success: false, error: 'Not authorised' };

    const { error } = await supabase
      .from('deals')
      .update({ owner_entity_id: ownerEntityId } as any)
      .eq('id', dealId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to assign owner.' };
  }
}
