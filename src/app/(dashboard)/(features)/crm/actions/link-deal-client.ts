'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type LinkDealClientResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Link a deal to a Network organization (and optionally main contact).
 * Used when user selects a client from OmniSearch or creates one via Ghost Forge in the Deal Room.
 */
export async function linkDealToClient(
  dealId: string,
  organizationId: string,
  mainContactId?: string | null
): Promise<LinkDealClientResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No workspace.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('deals')
    .update({
      organization_id: organizationId,
      main_contact_id: mainContactId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  // Revalidate /crm so the deals stream sidebar reflects the new client name
  // (organization_id is the legacy bill_to fallback that drives client_name
  // on the stream cards). Sidebar staleness was masked previously by the
  // client-side router.refresh() that we removed in the perf cleanup.
  revalidatePath('/crm');

  return { success: true };
}
