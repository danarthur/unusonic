'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { revalidatePath } from 'next/cache';

/**
 * Creates a CLIENT edge in cortex between the workspace entity and the given
 * client entity. Called after deal creation so the client appears in the
 * Network graph automatically.
 */
export async function linkClientToNetwork(
  clientEntityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: 'No active org' };

  const supabase = await createClient();

  // Find the workspace's own company entity via legacy_org_id (same pattern as getNetworkStream)
  const { data: workspaceEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();

  if (!workspaceEntity) {
    return { ok: false, error: 'Workspace entity not found' };
  }

  const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: workspaceEntity.id,
    p_target_entity_id: clientEntityId,
    p_type: 'CLIENT',
    p_context_data: {
      tier: 'preferred',
      lifecycle_status: 'active',
      deleted_at: null,
    },
  });

  if (rpcErr) {
    console.error('[CRM] linkClientToNetwork error:', rpcErr.message);
    return { ok: false, error: rpcErr.message };
  }

  revalidatePath('/network');
  revalidatePath('/productions');
  return { ok: true };
}

/**
 * Creates a VENUE_PARTNER edge between a venue entity and a client entity
 * in cortex. Non-fatal — callers should catch errors rather than blocking
 * the deal flow.
 */
export async function linkVenueToClient(
  venueEntityId: string,
  clientEntityId: string,
): Promise<void> {
  try {
    const supabase = await createClient();

    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: clientEntityId,
      p_target_entity_id: venueEntityId,
      p_type: 'VENUE_PARTNER',
      p_context_data: {
        industry_tags: ['venue'],
        deleted_at: null,
      },
    });

    if (rpcErr) {
      console.error('[CRM] linkVenueToClient error (non-fatal):', rpcErr.message);
    }
  } catch (err) {
    console.error('[CRM] linkVenueToClient unexpected (non-fatal):', err);
  }
}
