/**
 * Finance feature – Fetch gig financials (invoices, items, payments)
 * Computes collected vs total on the server to avoid client-side math errors.
 * @module features/finance/api/get-gig-financials
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { canAccessDealFinancials } from '@/shared/lib/permissions';
import type {
  GigFinancialsDTO,
  InvoiceDTO,
  InvoiceItemDTO,
  FinancialSummaryDTO,
  ProfitabilityDTO,
  TopRevenueItemDTO,
  PaymentTimelineDTO,
} from '../model/types';

// =============================================================================
// Server action
// =============================================================================

/** Get financials for an event (unified events table; invoices reference event_id). */
export async function getFinancials(
  eventId: string
): Promise<GigFinancialsDTO | null> {
  const supabase = await createClient();

  // 1. Event title (and verify access via RLS)
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return null;
  }

  // 2. Invoices for this event
  const { data: invoiceRows, error: invError } = await supabase
    .from('invoices')
    .select(
      'id, event_id, proposal_id, invoice_number, status, total_amount, token, issue_date, due_date, created_at'
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (invError) {
    return null;
  }

  const invoices = invoiceRows ?? [];

  // 3. All invoice items for these invoices
  const invoiceIds = invoices.map((i) => i.id);
  let itemsByInvoice: Record<string, InvoiceItemDTO[]> = {};
  if (invoiceIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('invoice_items')
      .select('id, invoice_id, description, amount, cost, quantity')
      .in('invoice_id', invoiceIds)
      .order('id', { ascending: true });

    const items = itemRows ?? [];
    for (const row of items) {
      const list = itemsByInvoice[row.invoice_id] ?? [];
      const cost = Number(row.cost ?? 0) || 0;
      const quantity = Number(row.quantity ?? 1);
      list.push({
        id: row.id,
        invoice_id: row.invoice_id,
        description: row.description,
        amount: String(row.amount),
        cost,
        quantity,
      });
      itemsByInvoice[row.invoice_id] = list;
    }
  }

  // 4. All payments for these invoices (to compute amountPaid per invoice)
  let paymentsByInvoice: Record<string, number> = {};
  if (invoiceIds.length > 0) {
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('invoice_id, amount, status')
      .in('invoice_id', invoiceIds)
      .eq('status', 'succeeded');

    const payments = paymentRows ?? [];
    for (const p of payments) {
      paymentsByInvoice[p.invoice_id] =
        (paymentsByInvoice[p.invoice_id] ?? 0) + Number(p.amount);
    }
  }

  // 5. Build InvoiceDTO[] with amountPaid (server-computed)
  const invoiceDTOs: InvoiceDTO[] = invoices.map((inv) => {
    const totalAmount = Number(inv.total_amount);
    const amountPaid = paymentsByInvoice[inv.id] ?? 0;
    return {
      id: inv.id,
      event_id: inv.event_id,
      proposal_id: inv.proposal_id ?? null,
      invoice_number: inv.invoice_number ?? null,
      status: inv.status,
      total_amount: String(inv.total_amount),
      token: inv.token,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      created_at: inv.created_at,
      invoiceItems: itemsByInvoice[inv.id] ?? [],
      amountPaid,
    };
  });

  // 6. Summary: totalRevenue (excluding cancelled), collected, outstanding, progress
  let totalRevenue = 0;
  let collected = 0;
  for (const inv of invoiceDTOs) {
    if (inv.status !== 'cancelled') {
      totalRevenue += Number(inv.total_amount);
    }
    collected += inv.amountPaid;
  }
  const outstanding = totalRevenue - collected;
  const progress =
    totalRevenue > 0 ? (collected / totalRevenue) * 100 : 0;
  const progressPercentage = Math.round(progress);

  const summary: FinancialSummaryDTO = {
    totalRevenue,
    collected,
    outstanding,
    progress,
    progressPercentage,
  };

  // 7. Deal for this event (for stakeholder override and proposals)
  const { data: dealRow } = await supabase
    .from('deals')
    .select('id, workspace_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (dealRow?.id && dealRow?.workspace_id) {
    const allowed = await canAccessDealFinancials(dealRow.workspace_id, dealRow.id);
    if (!allowed) return null;
  }

  const { data: proposals } = dealRow?.id
    ? await supabase
        .from('proposals')
        .select('id, status')
        .eq('deal_id', dealRow.id)
        .in('status', ['accepted', 'sent'])
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; status: string }[] };

  const proposalIds = (proposals ?? []).map((p) => ({
    id: p.id,
    status: p.status ?? '',
  }));

  // 8. Profitability: totalCost, grossProfit, margin (exclude cancelled)
  let totalCost = 0;
  const allItems: { amount: number; cost: number; description: string; id: string; invoice_number: string | null }[] = [];
  for (const inv of invoiceDTOs) {
    if (inv.status === 'cancelled') continue;
    for (const item of inv.invoiceItems) {
      totalCost += item.cost;
      allItems.push({
        id: item.id,
        description: item.description,
        amount: Number(item.amount),
        cost: item.cost,
        invoice_number: inv.invoice_number,
      });
    }
  }
  const grossProfit = totalRevenue - totalCost;
  const marginPercent =
    totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const profitability: ProfitabilityDTO = {
    totalCost,
    grossProfit,
    margin: marginPercent,
    marginPercent,
  };

  // 9. Top 5 items by amount (for RevenueStream)
  const topRevenueItems: TopRevenueItemDTO[] = allItems
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      description: item.description,
      amount: item.amount,
      invoice_number: item.invoice_number,
    }));

  // 10. Payment timeline: first non-cancelled invoice issue/due + outstanding for overdue styling
  const firstInvoice = invoiceDTOs.find((inv) => inv.status !== 'cancelled');
  const paymentTimeline: PaymentTimelineDTO | null = firstInvoice
    ? {
        issueDate: firstInvoice.issue_date,
        dueDate: firstInvoice.due_date,
        today: new Date().toISOString().slice(0, 10),
        outstanding,
      }
    : null;

  return {
    eventId,
    eventTitle: event.title ?? 'Event',
    invoices: invoiceDTOs,
    summary,
    profitability,
    topRevenueItems,
    paymentTimeline,
    proposalIds,
  };
}
