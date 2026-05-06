'use server';

/**
 * Financial Pulse — reads finance.invoices and finance.payments only.
 *
 * Companion to the Payment Health widget rebuild on the sibling branch
 * (commit 8c00e34). This widget previously derived "outstanding" /
 * "overdue" from `public.proposals.expires_at` (proposals past their
 * expiry without signature). That's not actual outstanding/overdue
 * money; it's expired-proposal-pipeline. The owner-confirmed contract:
 *
 *   - status IN ('sent','overdue','partial')   // not draft/void/paid
 *   - due_date IS NOT NULL                     // overdue requires a date
 *   - (total_amount - paid_amount) > 0         // outstanding balance
 *   - "overdue" additionally requires due_date < CURRENT_DATE.
 *
 * `finance.invoices.total_amount` / `paid_amount` and
 * `finance.payments.amount` are `numeric(14,2)` (dollars). The widget
 * UI and the Aion `getWorkspaceSnapshot` consumers expect this DTO in
 * cents (they divide by 100), so we multiply on the way out — matching
 * the historical contract.
 *
 * Revenue still buckets `finance.payments` (status='succeeded') by
 * `received_at` falling inside the active period, with a same-length
 * preceding window for the comparison.
 */

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

const ACTIVE_INVOICE_STATUSES = ['sent', 'overdue', 'partial'] as const;

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

function todayYmd(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/** Convert a `numeric(14,2)` dollar value (number | string) to integer cents. */
function dollarsToCents(value: number | string | null | undefined): number {
  const n = Number(value) || 0;
  return Math.round(n * 100);
}

type SupaClient = Awaited<ReturnType<typeof createClient>>;

interface ARTotals {
  outstandingTotal: number;
  outstandingCount: number;
  overdueTotal: number;
  overdueCount: number;
}

async function computeARTotals(
  supabase: SupaClient,
  workspaceId: string,
  todayYmdValue: string,
): Promise<ARTotals> {
  const { data, error } = await supabase
    .schema('finance')
    .from('invoices')
    .select('id, status, total_amount, paid_amount, due_date')
    .eq('workspace_id', workspaceId)
    .in('status', ACTIVE_INVOICE_STATUSES as unknown as string[])
    .not('due_date', 'is', null);

  if (error) console.error('[financial-pulse] invoice fetch error:', error.message);

  let outstandingTotal = 0;
  let outstandingCount = 0;
  let overdueTotal = 0;
  let overdueCount = 0;

  for (const inv of (data ?? []) as Array<{
    status: string;
    total_amount: number | string;
    paid_amount: number | string;
    due_date: string | null;
  }>) {
    const balanceCents = dollarsToCents(inv.total_amount) - dollarsToCents(inv.paid_amount);
    if (balanceCents <= 0 || !inv.due_date) continue;

    outstandingTotal += balanceCents;
    outstandingCount += 1;

    if (inv.due_date < todayYmdValue) {
      overdueTotal += balanceCents;
      overdueCount += 1;
    }
  }

  return { outstandingTotal, outstandingCount, overdueTotal, overdueCount };
}

interface RevenueBuckets {
  revenueThisMonth: number;
  revenueLastMonth: number;
}

async function computeRevenueBuckets(
  supabase: SupaClient,
  workspaceId: string,
  bounds: PeriodBounds,
): Promise<RevenueBuckets> {
  let query = supabase
    .schema('finance')
    .from('payments')
    .select('amount, received_at, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'succeeded')
    .gte('received_at', `${bounds.lastPeriodStart}T00:00:00Z`);

  if (bounds.thisPeriodEndExclusive) {
    query = query.lt('received_at', `${bounds.thisPeriodEndExclusive}T00:00:00Z`);
  }

  const { data, error } = await query;
  if (error) console.error('[financial-pulse] payments fetch error:', error.message);

  let revenueThisMonth = 0;
  let revenueLastMonth = 0;

  for (const p of (data ?? []) as Array<{
    amount: number | string;
    received_at: string;
  }>) {
    if (!p.received_at) continue;
    const ymd = p.received_at.slice(0, 10);
    const cents = dollarsToCents(p.amount);

    const inThisPeriod = bounds.thisPeriodEndExclusive
      ? ymd >= bounds.thisPeriodStart && ymd < bounds.thisPeriodEndExclusive
      : ymd >= bounds.thisPeriodStart;

    if (inThisPeriod) {
      revenueThisMonth += cents;
    } else if (ymd >= bounds.lastPeriodStart && ymd < bounds.lastPeriodEndExclusive) {
      revenueLastMonth += cents;
    }
  }

  return { revenueThisMonth, revenueLastMonth };
}

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Financial health pulse — invoice + payment based.
 *
 * Outstanding/overdue derive from `finance.invoices` (status sent/overdue/partial
 * with a non-null due_date and remaining balance). Revenue derives from
 * `finance.payments` rows (status='succeeded') bucketed by `received_at`.
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
  const bounds = resolvePeriodBounds(now, period);

  const [ar, revenue] = await Promise.all([
    computeARTotals(supabase, workspaceId, todayYmd(now)),
    computeRevenueBuckets(supabase, workspaceId, bounds),
  ]);

  // Delta calculation with division-by-zero safety
  const revenueDelta =
    revenue.revenueLastMonth > 0
      ? Math.round(((revenue.revenueThisMonth - revenue.revenueLastMonth) / revenue.revenueLastMonth) * 100)
      : revenue.revenueThisMonth > 0
        ? 100
        : 0;

  return {
    revenueThisMonth: revenue.revenueThisMonth,
    revenueLastMonth: revenue.revenueLastMonth,
    revenueDelta,
    outstandingTotal: ar.outstandingTotal,
    outstandingCount: ar.outstandingCount,
    overdueTotal: ar.overdueTotal,
    overdueCount: ar.overdueCount,
  };
}
