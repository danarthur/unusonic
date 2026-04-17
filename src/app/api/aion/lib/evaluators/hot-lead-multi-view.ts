/**
 * hot_lead_multi_view — proposals viewed 3+ times in the last 48 hours
 * without a reply or signature. Buy signal that often out-ranks the
 * generic `proposal_viewed_unsigned` (which starts at 2 views over 7 days).
 *
 * The "hot" framing separates recency-weighted interest from slow long-tail
 * views — a proposal viewed 4x in one day implies active consideration;
 * 4x over three weeks often means the client is circulating it.
 *
 * Skips proposals already covered by `proposal_viewed_unsigned` with
 * overlapping entity_id? No — both can fire; the brief's compound-story
 * collapse (Phase 3) will merge them. For now, hot_lead takes higher
 * priority and the reorder pass surfaces it first on sales layouts.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { type InsightCandidate } from '../insight-evaluators';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_VIEWS = 3;

type ProposalRow = {
  id: string;
  deal_id: string;
  view_count: number;
  last_viewed_at: string;
  first_viewed_at: string | null;
  deals: { title: string | null; organization_id: string | null } | null;
};

type OrgRow = { id: string; display_name: string | null };

export async function evaluateHotLeadMultiView(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data } = await system
    .from('proposals')
    .select(
      'id, deal_id, view_count, last_viewed_at, first_viewed_at, deals!inner(title, organization_id)',
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'sent')
    .is('signed_at', null)
    .gte('view_count', MIN_VIEWS)
    .gte('last_viewed_at', windowStart);

  if (!data?.length) return [];

  // Additional narrowing: the 48h window check above catches proposals
  // ACTIVE in the last 48h, but we want to ensure the views are CONCENTRATED
  // in the window. Use first_viewed_at as a rough proxy when available;
  // otherwise trust the view_count + last_viewed_at signal.
  const rows = (data as unknown as ProposalRow[]).filter((r) => {
    if (!r.first_viewed_at) return true;
    const spanMs = new Date(r.last_viewed_at).getTime() - new Date(r.first_viewed_at).getTime();
    // 5-day view spread with 3 views is probably not "hot" — let the
    // generic unsigned evaluator catch it instead.
    return spanMs <= 5 * 86_400_000;
  });

  if (rows.length === 0) return [];

  const orgIds = [
    ...new Set(rows.map((r) => r.deals?.organization_id).filter((x): x is string => Boolean(x))),
  ];
  let orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await system
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', orgIds);
    orgNames = Object.fromEntries(
      ((orgs ?? []) as OrgRow[]).map((o) => [o.id, o.display_name ?? 'Unnamed client']),
    );
  }

  return rows.map((p) => {
    const dealTitle = p.deals?.title ?? 'Untitled deal';
    const clientName = p.deals?.organization_id
      ? orgNames[p.deals.organization_id]
      : null;

    const hoursInWindow = Math.max(
      1,
      Math.round((Date.now() - new Date(p.last_viewed_at).getTime()) / (60 * 60 * 1000)),
    );

    // Priority: base 35, +3 per view beyond 3 (cap at 48), +5 if viewed in last 6h.
    const priority = Math.min(
      48,
      35 + (p.view_count - 3) * 3 + (hoursInWindow <= 6 ? 5 : 0),
    );

    const urgency: InsightCandidate['urgency'] =
      p.view_count >= 6 ? 'high' : 'medium';

    const clientLabel = clientName ?? dealTitle;
    const title = hoursInWindow <= 6
      ? `${clientLabel} just viewed the quote ${p.view_count}×`
      : `${clientLabel} viewed the quote ${p.view_count}× in the last ${Math.min(48, hoursInWindow)}h`;

    return {
      triggerType: 'hot_lead_multi_view',
      entityType: 'proposal',
      entityId: p.id,
      title,
      context: {
        dealId: p.deal_id,
        dealTitle,
        clientName,
        viewCount: p.view_count,
        lastViewedAt: p.last_viewed_at,
        hoursSinceLastView: hoursInWindow,
      },
      priority,
      suggestedAction: 'Reach out while they\u2019re actively looking',
      href: `/crm/deal/${p.deal_id}/proposal-builder`,
      urgency,
    };
  });
}
