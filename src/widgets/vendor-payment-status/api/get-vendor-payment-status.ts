'use server';

/**
 * Vendor payment status widget — data fetcher.
 *
 * Reads the `ops.vendor_payment_status` table metric (Phase 5.4). Top 3
 * vendors by outstanding balance on the active tour. Gated on `finance:view`.
 *
 * @module widgets/vendor-payment-status/api/get-vendor-payment-status
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

export type VendorRow = {
  vendor_id: string;
  vendor_name: string;
  outstanding: number;
  outstandingFormatted: string;
  overdueCount: number;
};

export type VendorPaymentStatusDTO = {
  rows: VendorRow[];
  errored: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function fmtCurrency(n: number): string {
  return USD.format(n);
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

export async function getVendorPaymentStatus(): Promise<VendorPaymentStatusDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const allowed = await hasCapability(user.id, workspaceId, 'finance:view');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'ops.vendor_payment_status');

  if (!result.ok || result.kind !== 'table') {
    return { rows: [], errored: true };
  }

  const rows: VendorRow[] = result.rows.slice(0, 3).map((raw) => {
    const outstanding = pickNumber(raw, 'outstanding', 'outstanding_amount', 'balance');
    return {
      vendor_id: pickString(raw, 'vendor_id', 'id'),
      vendor_name: pickString(raw, 'vendor_name', 'name'),
      outstanding,
      outstandingFormatted: fmtCurrency(outstanding),
      overdueCount: pickNumber(raw, 'overdue_count', 'overdue'),
    };
  });

  return { rows, errored: false };
}
