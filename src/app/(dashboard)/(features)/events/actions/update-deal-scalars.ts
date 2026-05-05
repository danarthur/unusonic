'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

const UpdateDealScalarsSchema = z.object({
  title: z.string().min(1).max(200).nullable().optional(),
  proposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  event_archetype: z.enum(['wedding', 'corporate', 'concert', 'festival', 'private', 'conference', 'other']).nullable().optional(),
  budget_estimated: z.number().min(0).nullable().optional(),
  lead_source: z.string().nullable().optional(),
  lead_source_id: z.string().uuid().nullable().optional(),
  lead_source_detail: z.string().max(500).nullable().optional(),
  referrer_entity_id: z.string().uuid().nullable().optional(),
  event_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  event_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  show_health: z.object({
    status: z.enum(['on_track', 'at_risk', 'blocked']),
    note: z.string().max(500),
    updated_at: z.string(),
    updated_by_name: z.string(),
  }).nullable().optional(),
});

export type UpdateDealScalarsInput = z.infer<typeof UpdateDealScalarsSchema>;
export type UpdateDealScalarsResult = { success: true } | { success: false; error: string };

/**
 * Updates scalar fields on a deal that the DealHeaderStrip edits inline.
 * Workspace ownership is verified before write.
 */
export async function updateDealScalars(
  dealId: string,
  patch: UpdateDealScalarsInput
): Promise<UpdateDealScalarsResult> {
  try {
    const parsed = UpdateDealScalarsSchema.safeParse(patch);
    if (!parsed.success) {
      const msg = parsed.error.message;
      return { success: false, error: msg };
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // Verify workspace ownership before update (same pattern as updateDealNotes)
    const { data: deal } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!deal) return { success: false, error: 'Not authorised' };

    // show_health: overwrite author metadata server-side. The client cannot be trusted
    // to supply updated_by_name — historically hardcoded to 'PM' for every user — and
    // we want the real display name to appear in audit reads. Resolve from the signed-in
    // user's directory entity, then fall back to auth user metadata, then to 'PM'.
    const dataToWrite: UpdateDealScalarsInput = { ...parsed.data };
    if (dataToWrite.show_health) {
      let authoredBy = 'PM';
      const { data: authResult } = await supabase.auth.getUser();
      const authUser = authResult.user;
      if (authUser) {
        const { data: claimedEntity } = await supabase
          .schema('directory')
          .from('entities')
          .select('display_name')
          .eq('claimed_by_user_id', authUser.id)
          .limit(1)
          .maybeSingle();
        const entityName = (claimedEntity as { display_name?: string | null } | null)?.display_name ?? null;
        const metaName =
          (authUser.user_metadata?.full_name as string | undefined) ??
          (authUser.user_metadata?.display_name as string | undefined) ??
          null;
        authoredBy = entityName ?? metaName ?? authUser.email ?? 'PM';
      }
      dataToWrite.show_health = {
        ...dataToWrite.show_health,
        updated_by_name: authoredBy,
        updated_at: new Date().toISOString(),
      };
    }

    const { error } = await supabase
      .from('deals')
      .update(dataToWrite)
      .eq('id', dealId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/events');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save.' };
  }
}
