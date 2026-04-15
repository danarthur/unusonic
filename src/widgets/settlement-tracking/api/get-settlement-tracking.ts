'use server';

/**
 * Settlement tracking widget — data fetcher.
 *
 * Reads the `ops.settlement_variance` table metric (Phase 5.4). Top 3 shows
 * with the largest expected-vs-actual variance on the active tour. Gated on
 * `finance:view` (settlement is money).
 *
 * Defaults the period to the current calendar month.
 *
 * @module widgets/settlement-tracking/api/get-settlement-tracking
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

export type SettlementRow = {
  event_id: string;
  event_title: string;
  expected: number;
  expectedFormatted: string;
  actual: number;
  actualFormatted: string;
  variance: number;
  /** Pre-formatted percent delta, e.g. "+12%" or "-4%". */
  variancePct: string;
};

export type SettlementTrackingDTO = {
  rows: SettlementRow[];
  errored: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultPeriod(): { period_start: string; period_end: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return {
    period_start: `${year}-${month}-01`,
    period_end: `${year}-${month}-${day}`,
  };
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function fmtCurrency(n: number): string {
  return USD.format(n);
}

function fmtVariancePct(expected: number, actual: number): string {
  if (!expected) return '—';
  const pct = ((actual - expected) / expected) * 100;
  // '-' sign is already in toFixed output for negatives; avoid nested ternary.
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.length > 0 && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

// ── Fetcher ────────────────────────────────────────────────────────────────

export async function getSettlementTracking(): Promise<SettlementTrackingDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const allowed = await hasCapability(user.id, workspaceId, 'finance:view');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'ops.settlement_variance', defaultPeriod());

  if (!result.ok || result.kind !== 'table') {
    return { rows: [], errored: true };
  }

  // Normalize row shapes defensively — the RPC column names may vary
  // (expected_amount vs expected, actual_amount vs actual). Handle both.
  const rows: SettlementRow[] = result.rows.slice(0, 3).map((raw) => {
    const expected = pickNumber(raw, 'expected', 'expected_amount');
    const actual = pickNumber(raw, 'actual', 'actual_amount');
    return {
      event_id: pickString(raw, 'event_id', 'id'),
      event_title: pickString(raw, 'event_title', 'title', 'name'),
      expected,
      expectedFormatted: fmtCurrency(expected),
      actual,
      actualFormatted: fmtCurrency(actual),
      variance: actual - expected,
      variancePct: fmtVariancePct(expected, actual),
    };
  });

  return { rows, errored: false };
}
