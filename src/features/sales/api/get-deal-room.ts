/**
 * Sales feature – Server Action: fetch Deal Room data for a gig
 * Fetches gig, latest proposal + items, latest contract; computes pipeline stage and stats.
 * @module features/sales/api/get-deal-room
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { canAccessDealProposals } from '@/shared/lib/permissions';
import type {
  DealRoomDTO,
  DealRoomGig,
  DealRoomPipeline,
  DealRoomContract,
  DealRoomStats,
  ProposalWithItems,
} from '../model/types';
import { PIPELINE_STAGES } from '../model/types';

// =============================================================================
// Pipeline stage logic (0–5)
// =============================================================================

function computePipelineStage(params: {
  hasProposal: boolean;
  proposalStatus: string | null;
  contractStatus: string | null;
  gigStatus: string | null;
}): number {
  const { hasProposal, proposalStatus, contractStatus, gigStatus } = params;

  // 5: Deposit Paid (Gig status = confirmed)
  if (gigStatus === 'confirmed') return 5;

  // 4: Contract Signed
  if (contractStatus === 'signed') return 4;

  // 3: Negotiation (Proposal viewed or rejected)
  if (proposalStatus === 'viewed' || proposalStatus === 'rejected') return 3;

  // 2: Proposal Sent
  if (proposalStatus === 'sent') return 2;

  // 1: Proposal Drafted (Proposal exists but status = draft)
  if (hasProposal && proposalStatus === 'draft') return 1;

  // 0: Inquiry (Gig created, no proposal or draft)
  return 0;
}

function probabilityFromStage(stage: number): number {
  const curve = [0.1, 0.25, 0.5, 0.6, 0.9, 1];
  return curve[Math.min(stage, 5)] ?? 0;
}

// =============================================================================
// Server Action
// =============================================================================

/** Fetch Deal Room data for an event (unified events table). */
export async function getGigDealRoom(eventId: string): Promise<DealRoomDTO | null> {
  const supabase = await createClient();

  // 1. Event details
  const { data: eventRow, error: eventError } = await supabase
    .schema('ops')
    .from('events')
    .select(
      `
      id,
      workspace_id,
      title,
      lifecycle_status,
      client_entity_id
    `
    )
    .eq('id', eventId)
    .single();

  if (eventError || !eventRow) {
    if (process.env.NODE_ENV === 'development' && eventError) {
      console.error('[getGigDealRoom] event fetch failed:', eventError.message, { code: eventError.code });
    }
    return null;
  }

  const row = eventRow as { client_entity_id?: string | null };

  // Resolve client name from directory.entities
  let clientName: string | null = null;
  if (row.client_entity_id) {
    const { data: dirEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', row.client_entity_id)
      .maybeSingle();
    clientName = dirEnt?.display_name ?? null;
  }
  const clientEmail: string | null = null;

  const gig: DealRoomGig = {
    id: eventRow.id,
    workspaceId: (eventRow as { workspace_id?: string }).workspace_id ?? '',
    title: eventRow.title ?? '',
    status: (eventRow as { lifecycle_status?: string }).lifecycle_status ?? 'lead',
    clientName: clientName ?? null,
    clientEmail: clientEmail ?? null,
  };

  // 2. Deal linked to this event, then latest proposal for that deal
  const { data: dealRow } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (dealRow?.id && gig.workspaceId) {
    const allowed = await canAccessDealProposals(gig.workspaceId, dealRow.id);
    if (!allowed) return null;
  }

  let activeProposal: ProposalWithItems | null = null;
  let totalValue = 0;

  if (dealRow?.id) {
    const { data: proposals } = await supabase
      .from('proposals')
      .select('*')
      .eq('deal_id', dealRow.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (proposals && proposals.length > 0) {
      const proposal = proposals[0];
      const { data: items } = await supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_id', proposal.id)
        .order('sort_order', { ascending: true });

      const itemList = items ?? [];
      totalValue = itemList.reduce(
        (sum, row) => sum + Number(row.quantity ?? 1) * Number(row.unit_price ?? 0),
        0
      );

      activeProposal = {
        ...proposal,
        items: itemList,
      };
    }
  }

  // 3. Latest contract for this event
  const { data: contractRows } = await supabase
    .from('contracts')
    .select('status, signed_at, pdf_url')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(1);

  const contractRow = contractRows?.[0];
  let contractData: DealRoomContract | null = null;
  if (contractRow) {
    contractData = {
      status: contractRow.status ?? 'draft',
      signedAt: contractRow.signed_at ?? null,
      pdfUrl: contractRow.pdf_url ?? null,
    };
  }

  // 4. Pipeline stage (robust to missing proposal)
  const currentStage = computePipelineStage({
    hasProposal: !!activeProposal,
    proposalStatus: activeProposal?.status ?? null,
    contractStatus: contractData?.status ?? null,
    gigStatus: gig.status ?? null,
  });

  const pipeline: DealRoomPipeline = {
    currentStage,
    stages: [...PIPELINE_STAGES],
  };

  const stats: DealRoomStats = {
    totalValue,
    probability: probabilityFromStage(currentStage),
  };

  return {
    gig,
    dealId: dealRow?.id ?? null,
    pipeline,
    activeProposal,
    contract: contractData,
    stats,
  };
}
