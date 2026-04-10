/**
 * Resolve a proposal's client entity from its public_token.
 *
 * Thin wrapper around the client_resolve_proposal_entity RPC, which runs
 * SECURITY DEFINER to bridge the service_role → ops.events grant gap.
 *
 * Returns null if:
 *   - proposal doesn't exist
 *   - proposal status is not in the viewable set (draft/rejected hidden)
 *
 * Returns a partial result (clientEntityId=null) if the proposal is
 * viewable but no client entity is linked yet (lead-stage deal without
 * handoff, or the event's client_entity_id is still NULL).
 *
 * See client-portal-design.md §14.2, §14.4.
 *
 * @module shared/lib/client-portal/resolve-proposal-entity
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

export type ResolvedProposalEntity = {
  proposalId: string;
  dealId: string | null;
  eventId: string | null;
  clientEntityId: string | null;
  workspaceId: string;
};

const VIEWABLE_PROPOSAL_STATUSES = new Set(['sent', 'viewed', 'accepted']);

export async function resolveClientEntityForProposal(
  publicToken: string,
): Promise<ResolvedProposalEntity | null> {
  const trimmed = publicToken?.trim();
  if (!trimmed) return null;

  const supabase = getSystemClient();

  const { data, error } = await supabase.rpc('client_resolve_proposal_entity', {
    p_public_token: trimmed,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[client-portal/resolve-proposal-entity] RPC failed', {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.proposal_id) return null;

  if (!VIEWABLE_PROPOSAL_STATUSES.has(row.proposal_status)) {
    return null;
  }

  return {
    proposalId: row.proposal_id,
    dealId: row.deal_id ?? null,
    eventId: row.event_id ?? null,
    clientEntityId: row.client_entity_id ?? null,
    workspaceId: row.workspace_id ?? '',
  };
}
