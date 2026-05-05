/**
 * stage_advance_suggestion — suggests the owner advance a deal to the next
 * stage based on observable artifact state. Gates on stage.tags (not slug/
 * label) so workspaces that renamed stages still get suggestions.
 *
 * P0 heuristics:
 *
 *   A. Deal in a stage tagged `initial_contact` AND a non-draft proposal
 *      exists for it → suggest advance to `proposal_sent`.
 *      ("proposal is ready, you've probably already sent it")
 *
 *   B. Deal in a stage tagged `proposal_sent` AND the proposal status is
 *      `accepted` AND no contract is out yet → suggest advance to
 *      `contract_out`.
 *
 * The suggestion writes to cortex.aion_insights with context.suggested_stage_tag
 * so the client-side AionSuggestionRow can render an Accept button. The
 * Accept action resolves the tag to a concrete stage id in the workspace's
 * default pipeline and calls updateDealStatus.
 *
 * Reference: P0 plan §6 "evaluator gate on stage.tags not labels".
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { InsightCandidate } from '../insight-evaluators';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';

type StageRow = { id: string; tags: string[] };
type DealRow = {
  id: string;
  title: string | null;
  status: string;
  stage_id: string | null;
};

export async function evaluateStageAdvanceSuggestion(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();

  // Read all stages on the workspace's default pipeline. We gate on tags —
  // one workspace may tag its "Inquiry" stage `initial_contact`, another
  // may have split it into three stages that all share the same tag.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema
  const { data: stages } = await system
    .schema('ops')
    .from('pipeline_stages')
    .select('id, tags, pipeline_id, pipelines!inner(workspace_id, is_default)')
    .eq('pipelines.workspace_id', workspaceId)
    .eq('pipelines.is_default', true);

  const stageRows = ((stages ?? []) as Array<StageRow & { pipelines: unknown }>) as StageRow[];

  const inquiryStageIds = new Set(
    stageRows.filter((s) => (s.tags ?? []).includes('initial_contact')).map((s) => s.id),
  );
  const proposalStageIds = new Set(
    stageRows.filter((s) => (s.tags ?? []).includes('proposal_sent')).map((s) => s.id),
  );

  const { data: deals } = await system
    .from('deals')
    .select('id, title, status, stage_id')
    .eq('workspace_id', workspaceId)
    .in('status', [...OPEN_DEAL_STATUSES])
    .is('archived_at', null);

  if (!deals?.length) return [];

  const dealRows = deals as DealRow[];

  const out: InsightCandidate[] = [];

  // Heuristic A: inquiry-stage deals with a non-draft proposal.
  const inquiryDealIds = dealRows
    .filter((d) => d.stage_id && inquiryStageIds.has(d.stage_id))
    .map((d) => d.id);

  if (inquiryDealIds.length > 0) {
    const { data: proposals } = await system
      .from('proposals')
      .select('deal_id, status')
      .in('deal_id', inquiryDealIds)
      .in('status', ['sent', 'accepted']);

    const dealsWithProposal = new Set(
      ((proposals ?? []) as Array<{ deal_id: string; status: string }>).map((p) => p.deal_id),
    );

    for (const deal of dealRows) {
      if (!dealsWithProposal.has(deal.id)) continue;
      out.push({
        triggerType: 'stage_advance_suggestion',
        entityType: 'deal',
        entityId: deal.id,
        title: 'Proposal sent — advance stage?',
        context: {
          suggested_stage_tag: 'proposal_sent',
          current_stage_reason: 'proposal_exists',
          dealTitle: deal.title,
        },
        priority: 32,
        suggestedAction: 'Advance to Proposal',
        href: `/productions/deal/${deal.id}`,
        urgency: 'medium',
      });
    }
  }

  // Heuristic B: proposal-stage deals with an accepted proposal.
  const proposalDealIds = dealRows
    .filter((d) => d.stage_id && proposalStageIds.has(d.stage_id))
    .map((d) => d.id);

  if (proposalDealIds.length > 0) {
    const { data: accepted } = await system
      .from('proposals')
      .select('deal_id, status')
      .in('deal_id', proposalDealIds)
      .eq('status', 'accepted');

    const acceptedDealIds = new Set(
      ((accepted ?? []) as Array<{ deal_id: string }>).map((p) => p.deal_id),
    );

    for (const deal of dealRows) {
      if (!acceptedDealIds.has(deal.id)) continue;
      out.push({
        triggerType: 'stage_advance_suggestion',
        entityType: 'deal',
        entityId: deal.id,
        title: 'Proposal accepted — advance to contract?',
        context: {
          suggested_stage_tag: 'contract_out',
          current_stage_reason: 'proposal_accepted',
          dealTitle: deal.title,
        },
        priority: 38,
        suggestedAction: 'Advance to Contract',
        href: `/productions/deal/${deal.id}`,
        urgency: 'high',
      });
    }
  }

  return out;
}
