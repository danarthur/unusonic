/**
 * ProposalBuilderStudioRouter — server component that resolves the
 * `crm.proposal_builder_drag` feature flag for the deal's workspace and
 * renders either the legacy drag studio or the new palette-first studio.
 *
 * Kept as a tight shim: the actual studios are client components mounted
 * through `ProposalBuilderLoader`, which dynamic-imports them so the
 * route continues to split per variant. The flag is read server-side
 * using the standard user-scoped Supabase client, so RLS on workspaces
 * enforces that only a member can resolve their workspace's flags.
 *
 * Design doc: docs/reference/proposal-builder-rebuild-design.md §4.1.
 */

import { FEATURE_FLAGS, isFeatureEnabled } from '@/shared/lib/feature-flags';
import type { DealDetail } from '../actions/get-deal';
import { ProposalBuilderLoader } from '../deal/[id]/proposal-builder/proposal-builder-loader';

export type ProposalBuilderStudioRouterProps = {
  deal: DealDetail;
  contacts: { id: string; name: string; email: string }[];
  clientAttached: boolean;
};

export async function ProposalBuilderStudioRouter({
  deal,
  contacts,
  clientAttached,
}: ProposalBuilderStudioRouterProps) {
  // Workspaces created before migration 20260501000000 have the flag
  // backfilled to true — they keep the drag studio until explicitly flipped.
  // New workspaces have the flag unset → reader returns false → palette studio.
  const useDragStudio = deal.workspace_id
    ? await isFeatureEnabled(deal.workspace_id, FEATURE_FLAGS.CRM_PROPOSAL_BUILDER_DRAG)
    : false;

  return (
    <ProposalBuilderLoader
      variant={useDragStudio ? 'legacy' : 'palette'}
      deal={deal}
      contacts={contacts}
      clientAttached={clientAttached}
    />
  );
}
