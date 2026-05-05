'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

/**
 * Cancel a single show in a series (or a singleton) by setting archived_at.
 * The proposed_date trigger will re-sync public.deals.proposed_date to the
 * next live show. For P0 this is the reversible "soft cancel" — no credit
 * note automation, no client-visible changes beyond the Shows list.
 */
export async function cancelDealShow(eventId: string): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('id, deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!event) return { success: false, error: 'Show not found.' };

  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  const dealId = (event as { deal_id?: string | null }).deal_id;
  if (dealId) {
    revalidatePath(`/productions/${dealId}`);
  }
  revalidatePath('/productions');
  revalidatePath('/events');
  return { success: true };
}

/**
 * Restore a canceled show (undo cancel) by clearing archived_at. No-op if the
 * row was never archived.
 */
export async function restoreDealShow(eventId: string): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ archived_at: null })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/productions');
  revalidatePath('/events');
  return { success: true };
}
