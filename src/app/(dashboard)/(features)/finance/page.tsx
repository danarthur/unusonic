/**
 * Finance Dashboard Page — reads from finance.* tables
 *
 * Rebuilt to use the new finance schema (finance.invoices, finance.invoice_balances,
 * finance.payments) instead of the legacy ghost tables.
 *
 * @module app/(features)/finance
 */

import 'server-only';

import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { FinanceDashboardClient } from './finance-dashboard-client';
import type { FinanceDashboardData } from './types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Server-side data fetching
// ---------------------------------------------------------------------------

async function getWorkspaceId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get('workspace_id')?.value;
    if (fromCookie) return fromCookie;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    return membership?.workspace_id ?? null;
  } catch {
    return null;
  }
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_kind: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  issue_date: string | null;
  public_token: string | null;
  qbo_sync_status: string | null;
  event_id: string | null;
  deal_id: string | null;
  bill_to_snapshot: { display_name: string; [key: string]: unknown } | null;
}

interface BalanceRow {
  invoice_id: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  days_overdue: number;
}

interface LineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  item_kind: string;
}

async function getFinanceDashboardData(
  workspaceId: string,
): Promise<FinanceDashboardData | null> {
  try {
    const supabase = await createClient();

    // Fetch invoices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
    const { data: invoiceRows, error: invErr } = await (supabase as any)
      .schema('finance')
      .from('invoices')
      .select(
        'id, invoice_number, invoice_kind, status, total_amount, paid_amount, due_date, issue_date, public_token, qbo_sync_status, event_id, deal_id, bill_to_snapshot',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (invErr) {
      console.error('[Finance] Invoice fetch error:', invErr.message);
      return null;
    }

    const invoices = (invoiceRows ?? []) as InvoiceRow[];

    // Fetch balances view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
    const { data: balanceRows } = await (supabase as any)
      .schema('finance')
      .from('invoice_balances')
      .select('invoice_id, total_amount, paid_amount, balance_due, days_overdue');

    const balanceMap = new Map<string, BalanceRow>();
    for (const b of (balanceRows ?? []) as BalanceRow[]) {
      balanceMap.set(b.invoice_id, b);
    }

    // Fetch line items for all invoices
    const invoiceIds = invoices.map((i) => i.id);
    let lineItemRows: LineItemRow[] = [];
    if (invoiceIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
      const { data: liRows } = await (supabase as any)
        .schema('finance')
        .from('invoice_line_items')
        .select('id, invoice_id, description, quantity, unit_price, amount, item_kind')
        .in('invoice_id', invoiceIds)
        .order('position', { ascending: true });
      lineItemRows = (liRows ?? []) as LineItemRow[];
    }

    // Group line items by invoice
    const lineItemsByInvoice = new Map<string, LineItemRow[]>();
    for (const li of lineItemRows) {
      const arr = lineItemsByInvoice.get(li.invoice_id) ?? [];
      arr.push(li);
      lineItemsByInvoice.set(li.invoice_id, arr);
    }

    // Merge invoices with balances and line items
    const enriched = invoices.map((inv) => {
      const bal = balanceMap.get(inv.id);
      return {
        ...inv,
        balance_due: bal?.balance_due ?? Number(inv.total_amount) - Number(inv.paid_amount),
        days_overdue: bal?.days_overdue ?? 0,
        line_items: lineItemsByInvoice.get(inv.id) ?? [],
      };
    });

    // Compute stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let outstandingTotal = 0;
    let revenueThisMonth = 0;
    const statusCounts: Record<string, number> = {};
    const agingBuckets = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };

    for (const inv of enriched) {
      // Status counts
      statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;

      // Outstanding total (exclude paid and void)
      if (!['paid', 'void'].includes(inv.status) && inv.balance_due > 0) {
        outstandingTotal += inv.balance_due;
      }

      // Revenue this month (sum paid_amount for payments in current month)
      // Approximate: use paid_amount on invoices where status changed to paid recently
      // For accuracy, this should read from finance.payments, but for the dashboard summary
      // we use the invoice-level paid_amount
      if (inv.issue_date && new Date(inv.issue_date) >= monthStart) {
        revenueThisMonth += Number(inv.paid_amount);
      }

      // Aging buckets (only for outstanding invoices)
      if (!['paid', 'void', 'draft'].includes(inv.status) && inv.balance_due > 0) {
        const overdue = inv.days_overdue;
        if (overdue <= 0) {
          agingBuckets.current += inv.balance_due;
        } else if (overdue <= 30) {
          agingBuckets.days1to30 += inv.balance_due;
        } else if (overdue <= 60) {
          agingBuckets.days31to60 += inv.balance_due;
        } else if (overdue <= 90) {
          agingBuckets.days61to90 += inv.balance_due;
        } else {
          agingBuckets.days90plus += inv.balance_due;
        }
      }
    }

    return {
      invoices: enriched,
      stats: {
        outstandingTotal,
        revenueThisMonth,
        statusCounts,
        agingBuckets,
      },
    };
  } catch (error) {
    console.error('[Finance] Dashboard data error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FinanceLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 rounded-lg bg-[oklch(1_0_0_/_0.05)]" />
          <div className="mt-2 h-4 w-32 rounded-lg bg-[oklch(1_0_0_/_0.05)]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stage-panel p-5">
            <div className="h-3 w-20 rounded bg-[oklch(1_0_0_/_0.05)] mb-3" />
            <div className="h-8 w-28 rounded bg-[oklch(1_0_0_/_0.05)]" />
          </div>
        ))}
      </div>
      <div className="stage-panel p-6">
        <div className="h-4 w-24 rounded bg-[oklch(1_0_0_/_0.05)] mb-6" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 py-3">
            <div className="h-4 w-20 rounded bg-[oklch(1_0_0_/_0.05)]" />
            <div className="h-4 w-32 rounded bg-[oklch(1_0_0_/_0.05)]" />
            <div className="h-4 w-16 rounded bg-[oklch(1_0_0_/_0.05)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async page content
// ---------------------------------------------------------------------------

async function FinanceDashboardContent() {
  const workspaceId = await getWorkspaceId();

  if (!workspaceId) {
    return (
      <div className="stage-panel p-8 text-center">
        <h2 className="text-xl font-light text-[var(--stage-text-primary)] mb-2">
          Welcome to finance
        </h2>
        <p className="text-sm text-[var(--stage-text-secondary)] mb-4">
          Log in or set up your workspace to view financial data.
        </p>
        <a
          href="/login"
          className="stage-btn stage-btn-primary inline-block px-4 py-2 text-sm"
        >
          Sign in
        </a>
      </div>
    );
  }

  const data = await getFinanceDashboardData(workspaceId);

  if (!data) {
    return (
      <div className="stage-panel p-8 text-center">
        <h2 className="text-xl font-light text-[var(--stage-text-primary)] mb-2">
          Finance
        </h2>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          Unable to load financial data. Check your database connection.
        </p>
      </div>
    );
  }

  return (
    <FinanceDashboardClient
      workspaceId={workspaceId}
      initialData={data}
    />
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function FinancePage() {
  return (
    <div className="flex-1 min-h-[80vh] p-6 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <Suspense fallback={<FinanceLoadingSkeleton />}>
          <FinanceDashboardContent />
        </Suspense>
      </div>
    </div>
  );
}
