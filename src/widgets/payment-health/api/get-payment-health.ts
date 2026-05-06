'use server';

/**
 * Payment Health metrics — reads from `finance.invoices` only.
 *
 * "Overdue" / "at risk" means an actual issued invoice past its due_date with
 * an outstanding balance. Pre-invoice deal/proposal payment expectations
 * (deposits conceptually due, balance windows derived from event date) are
 * NOT counted as overdue here — those are sales follow-ups, not AR.
 *
 * Definition of overdue (confirmed with product owner):
 *   - status IN ('sent','overdue','partial')   // not draft/void/paid
 *   - due_date IS NOT NULL AND due_date < CURRENT_DATE
 *   - total_amount > paid_amount               // outstanding balance
 *
 * Outstanding amount = SUM(total_amount - paid_amount) over those rows.
 * `total_amount` / `paid_amount` are stored as numeric(14,2) — dollars, not
 * cents. The existing widget formats with `Intl.NumberFormat({style:'currency'})`
 * which expects dollars, so no unit conversion is needed here.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type PaymentHealthMetrics = {
  overdueCount: number;
  /** Sum of outstanding balance across overdue invoices. Dollars. */
  overdueAmount: number;
  /** Soonest non-overdue invoice with an outstanding balance, if any. */
  nextPayment: {
    dealTitle: string;
    dueDate: string; // YYYY-MM-DD (raw invoice due_date)
    amount: number | null; // dollars
    type: 'deposit' | 'balance';
  } | null;
};

const EMPTY: PaymentHealthMetrics = {
  overdueCount: 0,
  overdueAmount: 0,
  nextPayment: null,
};

const ACTIVE_STATUSES = ['sent', 'overdue', 'partial'] as const;

interface InvoiceRow {
  id: string;
  invoice_kind: string | null;
  status: string;
  total_amount: number | string;
  paid_amount: number | string;
  due_date: string | null;
  deal_id: string | null;
  bill_to_snapshot: { display_name?: string | null } | null;
}

type SupaClient = Awaited<ReturnType<typeof createClient>>;

function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fetchActiveInvoices(
  supabase: SupaClient,
  workspaceId: string,
): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .schema('finance')
    .from('invoices')
    .select(
      'id, invoice_kind, status, total_amount, paid_amount, due_date, deal_id, bill_to_snapshot',
    )
    .eq('workspace_id', workspaceId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .not('due_date', 'is', null);

  if (error) {
    console.error('[payment-health] invoice fetch error:', error.message);
    return [];
  }
  return (data ?? []) as InvoiceRow[];
}

async function fetchDealTitles(
  supabase: SupaClient,
  invoices: InvoiceRow[],
): Promise<Map<string, string>> {
  const dealIds = [...new Set(invoices.map((i) => i.deal_id).filter(Boolean) as string[])];
  const map = new Map<string, string>();
  if (dealIds.length === 0) return map;
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .in('id', dealIds)
    .is('archived_at', null);
  for (const d of (deals ?? []) as { id: string; title: string | null }[]) {
    if (d.title) map.set(d.id, d.title);
  }
  return map;
}

function resolveTitle(inv: InvoiceRow, dealTitleMap: Map<string, string>): string {
  const titleFromDeal = inv.deal_id ? dealTitleMap.get(inv.deal_id) : undefined;
  return titleFromDeal ?? inv.bill_to_snapshot?.display_name ?? 'Untitled invoice';
}

function balanceOf(inv: InvoiceRow): number {
  return (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
}

export async function getPaymentHealthMetrics(): Promise<PaymentHealthMetrics> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();
  const invoices = await fetchActiveInvoices(supabase, workspaceId);
  if (invoices.length === 0) return EMPTY;

  const dealTitleMap = await fetchDealTitles(supabase, invoices);
  const today = todayYmd();

  let overdueCount = 0;
  let overdueAmount = 0;
  let nextPayment: PaymentHealthMetrics['nextPayment'] = null;
  let nextPaymentDate = '￿'; // any real YYYY-MM-DD sorts before this sentinel

  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance <= 0 || !inv.due_date) continue;

    if (inv.due_date < today) {
      overdueCount += 1;
      overdueAmount += balance;
      continue;
    }

    if (inv.due_date < nextPaymentDate) {
      nextPaymentDate = inv.due_date;
      nextPayment = {
        dealTitle: resolveTitle(inv, dealTitleMap),
        dueDate: inv.due_date,
        amount: balance,
        type: inv.invoice_kind === 'deposit' ? 'deposit' : 'balance',
      };
    }
  }

  return { overdueCount, overdueAmount, nextPayment };
}
