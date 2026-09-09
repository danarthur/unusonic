'use server';

/**
 * Ending a link between two people without destroying it.
 *
 * The whole point of the status is that there is no delete here. A couple that
 * splits keeps its edge: the show still happened, the invoice still names both,
 * and a past deal that suddenly has one host stops being able to explain
 * itself. Blackbaud publishes the same instruction -- add an end date rather
 * than delete -- and NPSP renders the result as "(Former)" rather than dropping
 * the row.
 *
 * The RPC writes both direction rows. The edge is stored twice, once per
 * direction, and a status on one row only would read current from one partner's
 * record and former from the other's.
 *
 * @module features/network-data/api/set-linked-status
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';

export type SetLinkedStatusResult = { ok: true } | { ok: false; error: string };

export async function setLinkedStatus(
  entityId: string,
  partnerEntityId: string,
  status: 'current' | 'former',
  /** The day it ended. Ignored when restoring, which clears the date. */
  endedOn?: string | null,
): Promise<SetLinkedStatusResult> {
  if (!entityId || !partnerEntityId) return { ok: false, error: 'Two people are needed.' };
  if (entityId === partnerEntityId) return { ok: false, error: 'Those are the same person.' };

  const supabase = await createClient();

  // The RPC checks workspace membership and that both entities belong to it,
  // so this only has to establish which workspace is being claimed.
  const { data: entity } = await supabase
    .schema('directory').from('entities')
    .select('owner_workspace_id')
    .eq('id', entityId)
    .maybeSingle();
  if (!entity?.owner_workspace_id) return { ok: false, error: 'Contact not found.' };

  const { data, error } = await supabase.rpc('set_co_host_status', {
    p_workspace_id: entity.owner_workspace_id,
    p_partner_a_id: entityId,
    p_partner_b_id: partnerEntityId,
    p_status: status,
    p_ended_on: status === 'former' ? endedOn ?? null : null,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as { ok?: boolean; error?: string } | null;
  if (result && result.ok === false) {
    return { ok: false, error: result.error ?? 'Could not update that link.' };
  }

  revalidatePath('/network');
  revalidatePath(`/network/entity/${entityId}`);
  revalidatePath(`/network/entity/${partnerEntityId}`);
  return { ok: true };
}
