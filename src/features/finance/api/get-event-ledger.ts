'use server';
 

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { formatCurrency } from '../model/types';
import { getEventExpenses } from './expense-actions';
import { computeHoursBetween } from '@/shared/lib/parse-time';

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
  /** Expenses only (excludes labor). */
  expenseCost: number;
  /** Crew labor cost. */
  laborCost: number;
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
  /** Event duration in hours (from deal start/end times). Null if times unavailable. */
  eventHours: number | null;
  /** (Revenue - Crew Cost) / Event Hours. Null if event hours or revenue unavailable. */
  effectiveHourlyRate: number | null;
  /** How many crew_assignments have a pay_rate set vs total crew count. */
  crewRateCompleteness: { rated: number; total: number };
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
    effectiveHourlyRate: string | null;
  };
};

/**
 * Loads the full financial picture for an event:
 * - Revenue from finance.invoices (what clients owe/paid)
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
    .select('id, proposed_start_time, proposed_end_time')
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
        .select('quantity, unit_price, unit_type, unit_multiplier, override_price, actual_cost, definition_snapshot, is_package_header, package_instance_id')
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
          type ItemRow = { quantity: number; unit_price: number; unit_type: string | null; unit_multiplier: number | null; override_price: number | null; actual_cost: number | null; is_package_header?: boolean | null; package_instance_id?: string | null; definition_snapshot?: { tax_meta?: { is_taxable?: boolean | null }; margin_meta?: { category?: string } } | null };
          const i = item as ItemRow;
          const price = i.override_price ?? i.unit_price ?? 0;
          // Only apply unit_multiplier for hourly/daily billing; flat-rate items store informational hours only
          const multiplier = (i.unit_type === 'hour' || i.unit_type === 'day') ? (i.unit_multiplier ?? 1) : 1;
          const lineAmt = (i.quantity ?? 1) * multiplier * Number(price);
          revSum += lineAmt;
          // Accumulate taxable subtotal from snapshot (same logic as proposal-builder and public view)
          const snap = i.definition_snapshot;
          if (snap?.margin_meta?.category !== 'text' && snap?.tax_meta?.is_taxable !== false) {
            taxableSubtotal += lineAmt;
          }
          // Skip bundle children for cost — the header row already carries the total bundle cost.
          // Including both would double-count.
          const isBundleChild = !i.is_package_header && i.package_instance_id != null;
          if (i.actual_cost != null && !isBundleChild) {
            costSum += Number(i.actual_cost) * (i.quantity ?? 1) * multiplier;
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
  const paymentsByInvoice: Record<string, number> = {};
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
  let crewRated = 0;
  const crewTotal = (crewAssignments ?? []).length;
  for (const ca of crewAssignments ?? []) {
    const row = ca as { pay_rate?: number | null; pay_rate_type?: string | null; scheduled_hours?: number | null };
    if (row.pay_rate == null) continue;
    crewRated++;
    if (row.pay_rate_type === 'hourly') {
      crewCost += Number(row.pay_rate) * (row.scheduled_hours ?? 8);
    } else {
      crewCost += Number(row.pay_rate);
    }
  }
  const crewRateCompleteness = { rated: crewRated, total: crewTotal };

  // ── Costs: expenses ──────────────────────────────────────────────────────
  const expenses = await getEventExpenses(eventId);
  let expenseCost = 0;
  const expenseTransactions: LedgerTransaction[] = expenses.map((exp) => {
    expenseCost += Number(exp.amount);
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

  // ── Margin (includes both labor and expenses) ─────────────────────────────
  const totalCost = expenseCost + crewCost;
  const margin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  // ── Effective Hourly Rate (EHR) ────────────────────────────────────────────
  const dealRow = deal as { proposed_start_time?: string | null; proposed_end_time?: string | null } | null;
  const startTime = dealRow?.proposed_start_time ?? null;
  const endTime = dealRow?.proposed_end_time ?? null;
  const eventHours = startTime && endTime ? computeHoursBetween(startTime, endTime) : null;

  // EHR = (revenue - crew cost) / event hours
  // Use projectedRevenue when no invoices exist yet, fall back to totalRevenue
  const revenueForEHR = totalRevenue > 0 ? totalRevenue : (projectedRevenue ?? 0);
  const effectiveHourlyRate =
    eventHours != null && eventHours > 0 && revenueForEHR > 0
      ? Math.round((revenueForEHR - crewCost) / eventHours)
      : null;

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
    expenseCost,
    laborCost: crewCost,
    margin,
    marginPercent,
    collected,
    outstanding,
    projectedRevenue,
    crewCost,
    projectedCost,
    eventHours,
    effectiveHourlyRate,
    crewRateCompleteness,
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
      effectiveHourlyRate: effectiveHourlyRate != null ? `${formatCurrency(effectiveHourlyRate)}/hr` : null,
    },
  };
}
