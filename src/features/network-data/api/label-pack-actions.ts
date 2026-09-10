/**
 * Workspace label pack — the display vocabulary for network categories.
 *
 * Presentation only. Category keys stay immutable and are what filters,
 * exports, telemetry and Aion tools speak; this decides the words a workspace
 * sees for them.
 *
 * @module features/network-data/api/label-pack-actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { toLabelPack, type LabelPack } from '@/entities/network/model/label-packs';

/** The workspace's chosen pack, falling back to the default for any unknown value. */
export async function getWorkspaceLabelPack(workspaceId: string | null): Promise<LabelPack> {
  if (!workspaceId) return toLabelPack(null);
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspaces')
    .select('network_label_pack')
    .eq('id', workspaceId)
    .maybeSingle();
  return toLabelPack((data as { network_label_pack?: string } | null)?.network_label_pack ?? null);
}

/**
 * Change the workspace's vocabulary.
 *
 * The value is constrained by a CHECK on the column, so an unknown pack is
 * rejected by the database rather than silently rendering blank labels.
 */
export async function setWorkspaceLabelPack(
  workspaceId: string,
  pack: LabelPack,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!workspaceId) return { ok: false, error: 'Missing workspace.' };
  const supabase = await createClient();

  /*
    Through an RPC, because the direct update could never work and said nothing.

    `public.workspaces` has RLS policies for INSERT and SELECT and none for
    UPDATE, so this matched zero rows -- and PostgREST does not treat a zero-row
    update as an error. The action returned ok, the picker showed success, and
    the setting had never once been written since it shipped.

    The objection to a policy was that one broad enough to permit this column
    would also permit stripe_customer_id and subscription_status. That turned
    out to be an objection to a policy on its own: 20260910060000 pairs an
    owner/admin UPDATE policy with a column-level grant, so the policy decides
    who and the grant decides which. The six other settings that were failing
    the same way go through that. This one keeps its function -- it is already
    written, it validates the pack against a closed list, and it reports a miss
    rather than returning a bare ok.
  */
  const { data, error } = await supabase.rpc('set_workspace_label_pack', {
    p_workspace_id: workspaceId,
    p_pack: pack,
  });
  if (error) return { ok: false, error: error.message };

  // The RPC reports a miss rather than raising, so a silent no-op stays
  // impossible rather than merely unlikely.
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: result?.error ?? 'Could not change the vocabulary.' };
  }

  revalidatePath('/network');
  revalidatePath('/settings');
  return { ok: true };
}
