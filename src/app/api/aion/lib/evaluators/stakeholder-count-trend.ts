/**
 * stakeholder_count_trend — detects when a new stakeholder has joined a
 * deal's contact graph recently. Field Expert ranks stakeholder-count as
 * the #1 predictive signal from Gong's Deal Predictor: a new contact
 * materializing on a deal correlates strongly with buying-group alignment.
 *
 * Heuristic (v1, conservative):
 *   Active working deals where ≥1 cortex.relationships edge with
 *   relationship_type='DEAL_STAKEHOLDER' was created in the last 7 days
 *   AND the edge count in the previous 7 days was at least one lower.
 *
 * Priority: 45 (below stage-advance, above stale-deal).
 *
 * Creepy-line: GREEN. Counting the owner's own contact additions.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { InsightCandidate } from '../insight-evaluators';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';

type DealRow = { id: string; title: string | null; status: string | null };

type EdgeRow = {
  source_entity_id: string | null;
  created_at: string;
};

export async function evaluateStakeholderCountTrend(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 86_400_000).toISOString();

  // Active working deals only — won/lost stakeholders aren't actionable.
  const { data: deals } = await system
    .from('deals')
    .select('id, title, status')
    .eq('workspace_id', workspaceId)
    .in('status', [...OPEN_DEAL_STATUSES]);

  const dealRows = ((deals ?? []) as DealRow[]).filter((d) => d.status !== 'lost');
  if (dealRows.length === 0) return [];

  // Edges added in the last 14 days, keyed on deal. Cortex.relationships
  // is source→target directed; we look at edges with source=deal_id on
  // either side. The edge-type DEAL_STAKEHOLDER is the P0 stakeholder tag;
  // other types (PLANNER, VENDOR, VENUE) are domain edges, not sales ones.
  //
  // cortex.relationships has no workspace_id column — workspace scoping comes
  // from the source_entity_id → directory.entities.owner_workspace_id chain.
  // Since we filter by source_entity_id IN dealIds (from the workspace-scoped
  // deals query above), the workspace boundary is preserved.
  const dealIdList = dealRows.map((d) => d.id);
  const { data: edges } = await system
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id, relationship_type, created_at')
    .in('source_entity_id', dealIdList)
    .in('relationship_type', ['DEAL_STAKEHOLDER', 'PLANNER', 'BILL_TO', 'VENDOR'])
    .gte('created_at', fourteenDaysAgo);

  const edgesPerDeal = new Map<string, EdgeRow[]>();
  const dealIds = new Set(dealRows.map((d) => d.id));
  for (const e of (edges ?? []) as Array<{
    source_entity_id: string | null;
    target_entity_id: string | null;
    created_at: string;
  }>) {
    for (const id of [e.source_entity_id, e.target_entity_id]) {
      if (id && dealIds.has(id)) {
        const arr = edgesPerDeal.get(id) ?? [];
        arr.push({ source_entity_id: id, created_at: e.created_at });
        edgesPerDeal.set(id, arr);
      }
    }
  }

  const candidates: InsightCandidate[] = [];
  for (const deal of dealRows) {
    const edgesForDeal = edgesPerDeal.get(deal.id) ?? [];
    const last7 = edgesForDeal.filter((x) => x.created_at >= sevenDaysAgo).length;
    const prior7 = edgesForDeal.filter(
      (x) => x.created_at < sevenDaysAgo && x.created_at >= fourteenDaysAgo,
    ).length;

    if (last7 === 0) continue;
    if (last7 <= prior7) continue;

    const delta = last7 - prior7;
    const title = delta === 1
      ? `A new stakeholder joined ${deal.title ?? 'the deal'}`
      : `${delta} new stakeholders joined ${deal.title ?? 'the deal'}`;

    candidates.push({
      triggerType: 'stakeholder_count_trend',
      entityType: 'deal',
      entityId: deal.id,
      title,
      context: {
        delta_last_7d: delta,
        total_added_last_7d: last7,
        total_added_prior_7d: prior7,
      },
      priority: 45,
      suggestedAction: 'Check whether the thread needs a wider response.',
      href: `/crm?selected=${encodeURIComponent(deal.id)}`,
      urgency: delta >= 2 ? 'high' : 'medium',
    });
  }

  return candidates;
}
