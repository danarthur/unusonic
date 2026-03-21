'use server';

/**
 * Fetch QBO mirror data (finance_invoices, finance_expenses) for UI.
 * Optional eventId scopes to a single event (gig).
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export interface FinanceInvoiceRow {
  id: string;
  workspace_id: string;
  event_id: string;
  qbo_id: string;
  qbo_doc_number: string | null;
  amount: number;
  balance: number;
  status: string;
  due_date: string | null;
  currency: string | null;
  updated_at: string;
}

export interface FinanceMirrorData {
  invoices: FinanceInvoiceRow[];
  totalInvoiceAmount: number;
  totalExpenseAmount: number;
  /** Internal budget (e.g. from internal estimates) when provided */
  internalBudget?: number;
}

export async function getFinanceMirrorData(
  workspaceId: string,
  eventId?: string
): Promise<FinanceMirrorData> {
  const supabase = await createClient();

  let invoicesQuery = supabase
    .from('finance_invoices')
    .select('id, workspace_id, event_id, qbo_id, qbo_doc_number, amount, balance, status, due_date, currency, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (eventId) {
    invoicesQuery = invoicesQuery.eq('event_id', eventId);
  }

  const { data: invoiceRows } = await invoicesQuery;

  let expensesQuery = supabase
    .from('finance_expenses')
    .select('amount')
    .eq('workspace_id', workspaceId);

  if (eventId) {
    expensesQuery = expensesQuery.eq('event_id', eventId);
  }

  const { data: expenseRows } = await expensesQuery;

  const invoices: FinanceInvoiceRow[] = (invoiceRows ?? []).map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    event_id: r.event_id,
    qbo_id: r.qbo_id,
    qbo_doc_number: r.qbo_doc_number ?? null,
    amount: Number(r.amount ?? 0),
    balance: Number(r.balance ?? 0),
    status: r.status ?? 'open',
    due_date: r.due_date ?? null,
    currency: r.currency ?? null,
    updated_at: r.updated_at ?? '',
  }));

  const totalInvoiceAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const totalExpenseAmount = (expenseRows ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  return {
    invoices,
    totalInvoiceAmount,
    totalExpenseAmount,
  };
}
