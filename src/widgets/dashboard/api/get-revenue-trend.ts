'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type RevenueTrendMonth = {
  label: string;
  revenue: number; // cents
};

export type RevenueTrendData = {
  months: RevenueTrendMonth[];
};

const EMPTY: RevenueTrendData = { months: [] };

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Phase 2.4: optional global Lobby time-range. The trend is a trailing
 * 6-month series anchored on the period's end month. When omitted, the
 * anchor is "now" — preserving original behavior for existing callers.
 */
export interface RevenueTrendPeriod {
  periodStart: string;
  periodEnd: string;
}

/**
 * Monthly revenue for the last 6 months.
 * Revenue = sum of non-optional proposal item totals for accepted/signed proposals,
 * bucketed by the month the proposal closed (signed_at ?? accepted_at).
 */
export async function getRevenueTrend(period?: RevenueTrendPeriod): Promise<RevenueTrendData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();

  // Anchor: end of the active period (inclusive), falling back to "now".
  let anchorYear: number;
  let anchorMonth: number; // 0-indexed
  if (period) {
    const [ey, em] = period.periodEnd.split('-').map(Number);
    anchorYear = ey;
    anchorMonth = em - 1;
  } else {
    anchorYear = now.getFullYear();
    anchorMonth = now.getMonth();
  }

  // Build the 6-month window (inclusive of the anchor month)
  const windowStart = new Date(anchorYear, anchorMonth - 5, 1);
  const windowStartIso = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}-01`;

  // Fetch accepted/signed proposals in the window
  const { data: proposals, error } = await supabase
    .from('proposals')
    .select('id, signed_at, accepted_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['accepted', 'signed']);

  if (error || !proposals?.length) {
    return buildEmptyMonths(now);
  }

  // Filter to proposals that closed within the 6-month window
  const relevantProposals = proposals.filter((p) => {
    const closedDate = p.signed_at ?? p.accepted_at;
    return closedDate && closedDate >= windowStartIso;
  });

  if (relevantProposals.length === 0) {
    return buildEmptyMonths(now);
  }

  const proposalIds = relevantProposals.map((p) => p.id);

  // Fetch items for these proposals
  const { data: items } = await supabase
    .from('proposal_items')
    .select('proposal_id, quantity, unit_price, override_price, is_optional, unit_multiplier')
    .in('proposal_id', proposalIds);

  // Build total per proposal
  const totalByProposal = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.is_optional) continue;
    const price = item.override_price ?? item.unit_price ?? 0;
    const qty = item.quantity ?? 1;
    const multiplier = item.unit_multiplier ?? 1;
    totalByProposal.set(
      item.proposal_id,
      (totalByProposal.get(item.proposal_id) ?? 0) + price * qty * multiplier,
    );
  }

  // Bucket revenue by month
  const revenueByKey = new Map<string, number>(); // "YYYY-MM" → cents
  for (const p of relevantProposals) {
    const closedDate = p.signed_at ?? p.accepted_at;
    if (!closedDate) continue;
    const key = closedDate.slice(0, 7); // "YYYY-MM"
    const total = totalByProposal.get(p.id) ?? 0;
    revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + total);
  }

  // Build ordered 6-month array, anchored on (anchorYear, anchorMonth)
  const months: RevenueTrendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchorYear, anchorMonth - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      label: MONTH_LABELS[d.getMonth()],
      revenue: revenueByKey.get(key) ?? 0,
    });
  }

  return { months };
}

/** Returns 6 months of zero-revenue entries (loading/empty state). */
function buildEmptyMonths(now: Date): RevenueTrendData {
  const months: RevenueTrendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: MONTH_LABELS[d.getMonth()], revenue: 0 });
  }
  return { months };
}
