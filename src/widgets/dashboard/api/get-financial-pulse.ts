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

/**
 * Phase 2.4: optional global Lobby time-range. Keeping the default path
 * identical (this-month vs last-month) preserves every existing caller.
 * When `periodStart`/`periodEnd` are provided, the "revenue this period"
 * bucket uses those bounds and the "revenue last period" bucket uses an
 * equal-length window immediately preceding them.
 */
export interface FinancialPulsePeriod {
  /** Inclusive YYYY-MM-DD. */
  periodStart: string;
  /** Inclusive YYYY-MM-DD. */
  periodEnd: string;
}

function ymdFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function ymdPlusOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return ymdFromMs(Date.UTC(y, m - 1, d + 1));
}

function precedingWindow({ periodStart, periodEnd }: FinancialPulsePeriod): { start: string; end: string } {
  // [start..end] inclusive → length in days = diff + 1.
  const [sy, sm, sd] = periodStart.split('-').map(Number);
  const [ey, em, ed] = periodEnd.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const lengthDays = Math.round((endMs - startMs) / 86_400_000) + 1;
  const prevEndMs = startMs - 86_400_000;
  const prevStartMs = prevEndMs - (lengthDays - 1) * 86_400_000;
  return { start: ymdFromMs(prevStartMs), end: ymdFromMs(prevEndMs) };
}

interface PeriodBounds {
  thisPeriodStart: string;
  /** Exclusive upper bound for the "this" bucket. `null` → open-ended (legacy current-month path). */
  thisPeriodEndExclusive: string | null;
  lastPeriodStart: string;
  lastPeriodEndExclusive: string;
}

function resolvePeriodBounds(now: Date, period?: FinancialPulsePeriod): PeriodBounds {
  if (period) {
    const prev = precedingWindow(period);
    return {
      thisPeriodStart: period.periodStart,
      thisPeriodEndExclusive: ymdPlusOneDay(period.periodEnd),
      lastPeriodStart: prev.start,
      lastPeriodEndExclusive: ymdPlusOneDay(prev.end),
    };
  }
  const thisMonthStart = startOfMonth(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    thisPeriodStart: thisMonthStart,
    thisPeriodEndExclusive: null,
    lastPeriodStart: startOfMonth(lastMonthDate),
    lastPeriodEndExclusive: thisMonthStart,
  };
}

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Financial health pulse — proposal-based revenue proxy.
 *
 * Unusonic does not have a traditional invoices table with paid/unpaid states.
 * Revenue is derived from accepted/signed proposals (their item totals).
 * "Outstanding" = proposals sent but not yet signed.
 * "Overdue" = proposals sent that are past their `expires_at` date without signature.
 *
 * Phase 2.4: optional `period` argument wires this to the global Lobby
 * time-range. When omitted, the default month-over-month comparison is
 * preserved (backward compatible).
 */
export async function getFinancialPulse(period?: FinancialPulsePeriod): Promise<FinancialPulseDTO> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();
  const {
    thisPeriodStart,
    thisPeriodEndExclusive,
    lastPeriodStart,
    lastPeriodEndExclusive,
  } = resolvePeriodBounds(now, period);

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
      // This proposal converted — count as revenue in the bucket it closed.
      const inThisPeriod = thisPeriodEndExclusive
        ? closedDate >= thisPeriodStart && closedDate < thisPeriodEndExclusive
        : closedDate >= thisPeriodStart;
      if (inThisPeriod) {
        revenueThisMonth += total;
      } else if (closedDate >= lastPeriodStart && closedDate < lastPeriodEndExclusive) {
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
