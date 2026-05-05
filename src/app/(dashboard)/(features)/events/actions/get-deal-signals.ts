'use server';

/**
 * getDealSignals — single source of truth for the per-deal signal stack.
 *
 * Used by:
 *   - Signals card (via the Prism bundle)
 *   - Aion's `get_deal_signals` tool (called when chat asks about a deal)
 *
 * Both surfaces read the SAME signals from this action, so the card never
 * disagrees with what Aion narrates. The action handles RLS naturally
 * because it uses the user-scoped Supabase client.
 *
 * Replaces the dead `deal.win_probability` field that the Signals card used
 * to read — see docs/audits/win-probability-research-2026-04-28.md for the
 * design rationale.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  computeDealSignals,
  type DealSignal,
  type DealSignalInputs,
} from '../lib/compute-deal-signals';

export type { DealSignal } from '../lib/compute-deal-signals';

type ProposalRow = Pick<
  DealSignalInputs['proposal'] & object,
  | 'status'
  | 'view_count'
  | 'first_viewed_at'
  | 'last_viewed_at'
  | 'created_at'
  | 'signed_at'
  | 'accepted_at'
  | 'deposit_paid_at'
>;

export async function getDealSignals(dealId: string): Promise<DealSignal[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status, proposed_date, owner_user_id, owner_entity_id, organization_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal) return [];

  // Most recent non-draft proposal — the active sales cycle. Drafts are
  // skipped because they haven't been sent and don't carry buy signals.
  const { data: proposalRows } = await supabase
    .from('proposals')
    .select(
      'status, view_count, first_viewed_at, last_viewed_at, created_at, signed_at, accepted_at, deposit_paid_at',
    )
    .eq('deal_id', dealId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);
  const proposal = (proposalRows?.[0] as ProposalRow | undefined) ?? null;

  // Prior won deals with the same organization (excludes the current deal).
  // The `repeat_client` signal needs a count, not the rows.
  let priorWonCount = 0;
  if (deal.organization_id) {
    const { count } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('organization_id', deal.organization_id)
      .eq('status', 'won')
      .neq('id', dealId);
    priorWonCount = count ?? 0;
  }

  return computeDealSignals({
    deal: {
      id: deal.id,
      status: deal.status,
      proposed_date: deal.proposed_date,
      owner_user_id: deal.owner_user_id,
      owner_entity_id: deal.owner_entity_id,
      organization_id: deal.organization_id,
    },
    proposal: proposal
      ? {
          status: proposal.status ?? null,
          view_count: proposal.view_count ?? null,
          first_viewed_at: proposal.first_viewed_at ?? null,
          last_viewed_at: proposal.last_viewed_at ?? null,
          created_at: proposal.created_at ?? null,
          signed_at: proposal.signed_at ?? null,
          accepted_at: proposal.accepted_at ?? null,
          deposit_paid_at: proposal.deposit_paid_at ?? null,
        }
      : null,
    priorWonCount,
    now: Date.now(),
  });
}
