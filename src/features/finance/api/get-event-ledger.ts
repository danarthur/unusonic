'use server';
/* eslint-disable no-restricted-syntax -- TODO: migrate entity attrs reads to readEntityAttrs() from @/shared/lib/entity-attrs */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { formatCurrency } from '../model/types';
import { getEventExpenses } from './expense-actions';

export type LedgerTransaction = {
  id: string;
  type: 'invoice' | 'expense';
  label: string;
  amount: number;
  inbound: boolean;
  date: string | null;   // ISO date
  status: string | null; // invoice status or null for expenses
};

export type EventLedgerDTO = {
  totalRevenue: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
  collected: number;
  outstanding: number;
  /** Projected revenue from the accepted proposal (null if no proposal found). */
  projectedRevenue: number | null;
  /** Estimated crew cost derived from ops.crew_assignments pay_rate fields. */
  crewCost: number;
  /** Projected cost from proposal_items.actual_cost on the accepted proposal (null if no accepted proposal). */
  projectedCost: number | null;
  transactions: LedgerTransaction[];
  // Formatted strings for display
  fmt: {
    totalRevenue: string;
    totalCost: string;
    margin: string;
    collected: string;
    outstanding: string;
    projectedRevenue: string | null;
    crewCost: string;
    projectedCost: string | null;
  };
};

/**
 * Loads the full financial picture for an event:
 * - Revenue from public.invoices (what clients owe/paid)
 * - Costs from ops.event_expenses (actual spend)
 * - Margin = revenue – costs
 * - Unified transaction stream for the Ledger Lens
 */
export async function getEventLedger(eventId: string): Promise<EventLedgerDTO | null> {
  const supabase = await createClient();

  // Verify access via RLS
  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, workspace_id')
    .eq('id', eventId)
    .maybeSingle();

  if (eventErr || !event) return null;

  // ── Projected revenue + cost: accepted proposal → proposal_items ──────────
  let projectedRevenue: number | null = null;
  let projectedCost: number | null = null;

  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .limit(1)
    .maybeSingle();

  if (deal) {
    const { data: proposal } = await supabase
      .from('proposals')
      .select('id')
      .eq('deal_id', (deal as { id: string }).id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (proposal) {
      const { data: items } = await supabase
        .from('proposal_items')
        .select('quantity, unit_price, unit_multiplier, override_price, actual_cost, definition_snapshot')
        .eq('proposal_id', (proposal as { id: string }).id);

      if (items && items.length > 0) {
        // Fetch workspace tax rate for tax-inclusive projected revenue
        const workspaceId = (event as { workspace_id?: string }).workspace_id;
        let workspaceTaxRate = 0;
        if (workspaceId) {
          const { data: ws } = await supabase
            .from('workspaces')
            .select('default_tax_rate')
            .eq('id', workspaceId)
            .maybeSingle();
          workspaceTaxRate = ws?.default_tax_rate != null ? Number(ws.default_tax_rate) : 0;
        }

        let revSum = 0;
        let taxableSubtotal = 0;
        let costSum = 0;
        let hasCost = false;
        for (const item of items) {
          type ItemRow = { quantity: number; unit_price: number; unit_multiplier: number | null; override_price: number | null; actual_cost: number | null; definition_snapshot?: { tax_meta?: { is_taxable?: boolean | null }; margin_meta?: { category?: string } } | null };
          const i = item as ItemRow;
          const price = i.override_price ?? i.unit_price ?? 0;
          const multiplier = i.unit_multiplier ?? 1;
          const lineAmt = (i.quantity ?? 1) * multiplier * Number(price);
          revSum += lineAmt;
          // Accumulate taxable subtotal from snapshot (same logic as proposal-builder and public view)
          const snap = i.definition_snapshot;
          if (snap?.margin_meta?.category !== 'text' && snap?.tax_meta?.is_taxable !== false) {
            taxableSubtotal += lineAmt;
          }
          if (i.actual_cost != null) {
            costSum += Number(i.actual_cost);
            hasCost = true;
          }
        }
        const taxAmount = workspaceTaxRate > 0 ? Math.round(taxableSubtotal * workspaceTaxRate * 100) / 100 : 0;
        projectedRevenue = revSum + taxAmount;
        projectedCost = hasCost ? costSum : null;
      }
    }
  }

  // ── Revenue: invoices ────────────────────────────────────────────────────
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_amount, issue_date')
    .eq('event_id', eventId)
    .order('issue_date', { ascending: false });

  const invoices = invoiceRows ?? [];
  const invoiceIds = invoices.map((i) => i.id);

  // Payments (to compute collected)
  let paymentsByInvoice: Record<string, number> = {};
  if (invoiceIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('invoice_id, amount, status')
      .in('invoice_id', invoiceIds)
      .eq('status', 'succeeded');
    for (const p of payments ?? []) {
      paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] ?? 0) + Number(p.amount);
    }
  }

  let totalRevenue = 0;
  let collected = 0;
  const invoiceTransactions: LedgerTransaction[] = invoices
    .filter((inv) => inv.status !== 'cancelled')
    .map((inv) => {
      const amount = Number(inv.total_amount);
      totalRevenue += amount;
      collected += paymentsByInvoice[inv.id] ?? 0;
      return {
        id: inv.id,
        type: 'invoice' as const,
        label: inv.invoice_number ? `Invoice #${inv.invoice_number}` : 'Invoice',
        amount,
        inbound: true,
        date: inv.issue_date,
        status: inv.status,
      };
    });

  const outstanding = totalRevenue - collected;

  // ── Crew cost: crew_assignments pay_rate aggregation ─────────────────────
  const { data: crewAssignments } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('pay_rate, pay_rate_type, booking_type, scheduled_hours')
    .eq('event_id', eventId)
    .neq('status', 'removed');

  let crewCost = 0;
  for (const ca of crewAssignments ?? []) {
    const row = ca as { pay_rate?: number | null; pay_rate_type?: string | null; scheduled_hours?: number | null };
    if (row.pay_rate == null) continue;
    if (row.pay_rate_type === 'hourly') {
      crewCost += Number(row.pay_rate) * (row.scheduled_hours ?? 8);
    } else {
      crewCost += Number(row.pay_rate);
    }
  }

  // ── Costs: expenses ──────────────────────────────────────────────────────
  const expenses = await getEventExpenses(eventId);
  let totalCost = 0;
  const expenseTransactions: LedgerTransaction[] = expenses.map((exp) => {
    totalCost += exp.amount;
    return {
      id: exp.id,
      type: 'expense' as const,
      label: exp.vendor_name ? `${exp.label} · ${exp.vendor_name}` : exp.label,
      amount: exp.amount,
      inbound: false,
      date: exp.paid_at,
      status: null,
    };
  });

  // ── Margin ────────────────────────────────────────────────────────────────
  const margin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  // ── Unified transaction stream (newest first) ─────────────────────────────
  const transactions = [...invoiceTransactions, ...expenseTransactions].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return {
    totalRevenue,
    totalCost,
    margin,
    marginPercent,
    collected,
    outstanding,
    projectedRevenue,
    crewCost,
    projectedCost,
    transactions,
    fmt: {
      totalRevenue: formatCurrency(totalRevenue),
      totalCost: formatCurrency(totalCost),
      margin: formatCurrency(margin),
      collected: formatCurrency(collected),
      outstanding: formatCurrency(outstanding),
      projectedRevenue: projectedRevenue != null ? formatCurrency(projectedRevenue) : null,
      crewCost: formatCurrency(crewCost),
      projectedCost: projectedCost != null ? formatCurrency(projectedCost) : null,
    },
  };
}
