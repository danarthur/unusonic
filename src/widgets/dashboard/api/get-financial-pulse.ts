'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type FinancialPulseDTO = {
  revenueThisMonth: number; // cents
  revenueLastMonth: number; // cents
  revenueDelta: number; // percentage change
  outstandingTotal: number; // cents
  outstandingCount: number;
  overdueTotal: number; // cents
  overdueCount: number;
};

const EMPTY: FinancialPulseDTO = {
  revenueThisMonth: 0,
  revenueLastMonth: 0,
  revenueDelta: 0,
  outstandingTotal: 0,
  outstandingCount: 0,
  overdueTotal: 0,
  overdueCount: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function startOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Financial health pulse — proposal-based revenue proxy.
 *
 * Unusonic does not have a traditional invoices table with paid/unpaid states.
 * Revenue is derived from accepted/signed proposals (their item totals).
 * "Outstanding" = proposals sent but not yet signed.
 * "Overdue" = proposals sent that are past their `expires_at` date without signature.
 */
export async function getFinancialPulse(): Promise<FinancialPulseDTO> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = startOfMonth(lastMonthDate);

  // Fetch all non-draft proposals for the workspace
  const { data: proposals, error } = await supabase
    .from('proposals')
    .select('id, status, signed_at, accepted_at, expires_at, updated_at')
    .eq('workspace_id', workspaceId)
    .neq('status', 'draft');

  if (error || !proposals?.length) return EMPTY;

  const proposalIds = proposals.map((p) => p.id);

  // Fetch all items for these proposals in one query
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

  // Revenue: accepted or signed proposals, bucketed by signed/accepted date
  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  let outstandingTotal = 0;
  let outstandingCount = 0;
  let overdueTotal = 0;
  let overdueCount = 0;

  const nowIso = now.toISOString();

  for (const p of proposals) {
    const total = totalByProposal.get(p.id) ?? 0;
    const closedDate = p.signed_at ?? p.accepted_at;

    if (closedDate) {
      // This proposal converted — count as revenue in the month it closed
      if (closedDate >= thisMonthStart) {
        revenueThisMonth += total;
      } else if (closedDate >= lastMonthStart && closedDate < thisMonthStart) {
        revenueLastMonth += total;
      }
    } else if (p.status === 'sent' || p.status === 'viewed') {
      // Still open — outstanding
      outstandingTotal += total;
      outstandingCount += 1;

      // Check if overdue (past expiry)
      if (p.expires_at && p.expires_at < nowIso) {
        overdueTotal += total;
        overdueCount += 1;
      }
    }
  }

  // Delta calculation with division-by-zero safety
  const revenueDelta =
    revenueLastMonth > 0
      ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
      : revenueThisMonth > 0
        ? 100
        : 0;

  return {
    revenueThisMonth,
    revenueLastMonth,
    revenueDelta,
    outstandingTotal,
    outstandingCount,
    overdueTotal,
    overdueCount,
  };
}
