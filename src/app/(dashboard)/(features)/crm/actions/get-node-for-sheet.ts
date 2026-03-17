'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getNetworkNodeDetails } from '@/features/network-data';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { COUPLE_ATTR } from '@/features/network-data/model/attribute-keys';
import type { NodeDetail } from '@/features/network-data';

/**
 * Fetch entity details for the inline NetworkDetailSheet in CRM stakeholder cards.
 * Called client-side on pencil click — avoids a full page navigation.
 */
export async function getNodeForSheet(
  nodeId: string,
  kind: 'internal_employee' | 'external_partner' = 'external_partner'
): Promise<NodeDetail | null> {
  const sourceOrgId = await getCurrentOrgId();
  if (!sourceOrgId) return null;
  return getNetworkNodeDetails(nodeId, kind, sourceOrgId);
}

export type CoupleEntityForEdit = {
  partnerAFirst: string;
  partnerALast: string;
  partnerAEmail: string | null;
  partnerBFirst: string;
  partnerBLast: string;
  partnerBEmail: string | null;
  displayName: string;
};

/**
 * Fetch couple entity attributes for the CoupleEditSheet.
 * Workspace-scoped via owner_workspace_id check.
 */
export async function getCoupleEntityForEdit(entityId: string): Promise<CoupleEntityForEdit | null> {
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;
  const { data } = await supabase.schema('directory').from('entities')
    .select('display_name, attributes')
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return null;
  const attrs = (data.attributes as Record<string, unknown>) ?? {};
  return {
    partnerAFirst: (attrs[COUPLE_ATTR.partner_a_first] as string) ?? '',
    partnerALast: (attrs[COUPLE_ATTR.partner_a_last] as string) ?? '',
    partnerAEmail: (attrs[COUPLE_ATTR.partner_a_email] as string | null) ?? null,
    partnerBFirst: (attrs[COUPLE_ATTR.partner_b_first] as string) ?? '',
    partnerBLast: (attrs[COUPLE_ATTR.partner_b_last] as string) ?? '',
    partnerBEmail: (attrs[COUPLE_ATTR.partner_b_email] as string | null) ?? null,
    displayName: data.display_name ?? '',
  };
}
