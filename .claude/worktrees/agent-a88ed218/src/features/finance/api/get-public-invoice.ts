/**
 * Finance feature – Fetch public invoice by token (client payment portal)
 * Uses system client to bypass RLS; only returns data for matching token.
 * @module features/finance/api/get-public-invoice
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { PublicInvoiceDTO, PublicInvoiceItemDTO } from '../model/public-invoice';

// =============================================================================
// Server fetcher
// =============================================================================

export async function getPublicInvoice(token: string): Promise<PublicInvoiceDTO | null> {
  if (!token?.trim()) return null;

  const supabase = getSystemClient();
  // finance.invoices / invoice_items not in generated public types
  const db = supabase as any;

  // 1. Invoice by token
  const { data: invoice, error: invError } = await db
    .from('invoices')
    .select('id, invoice_number, status, total_amount, token, issue_date, due_date, event_id, workspace_id')
    .eq('token', token.trim())
    .maybeSingle();

  if (invError || !invoice) return null;

  const invoiceId = invoice.id;
  const eventId = invoice.event_id;
  const workspaceId = invoice.workspace_id;

  // 2. Invoice items (sorted by sort_order)
  const { data: itemRows, error: itemsError } = await db
    .from('invoice_items')
    .select('id, invoice_id, description, quantity, unit_price, amount, sort_order')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });

  if (itemsError) return null;

  type InvoiceItemRow = { id: string; invoice_id: string; description: string | null; quantity: number | null; unit_price: number | null; amount: number | null; sort_order: number | null };
  const items: PublicInvoiceItemDTO[] = (itemRows ?? []).map((row: InvoiceItemRow) => ({
    id: row.id,
    invoice_id: row.invoice_id,
    description: row.description,
    quantity: String(row.quantity ?? '1'),
    unit_price: String(row.unit_price ?? '0'),
    amount: String(row.amount ?? '0'),
    sort_order: row.sort_order ?? 0,
  }));

  // 3. Workspace (name, logo)
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('id, name, logo_url')
    .eq('id', workspaceId)
    .single();

  if (workspaceError || !workspace) return null;

  // 4. Event (title, starts_at) — legacy public.events
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, starts_at')
    .eq('id', eventId)
    .single();

  if (eventError || !event) return null;

  // 5. Payments (to compute amountPaid)
  const { data: paymentRows } = await db
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'succeeded');

  const amountPaid = (paymentRows ?? []).reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);
  const totalAmount = Number(invoice.total_amount);
  const balanceDue = Math.max(0, totalAmount - amountPaid);

  return {
    invoice: {
      id: invoice.id,
      invoice_number: invoice.invoice_number ?? null,
      status: invoice.status,
      total_amount: String(invoice.total_amount),
      token: invoice.token,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
    },
    items,
    workspace: {
      id: workspace.id,
      name: workspace.name ?? '',
      logo_url: workspace.logo_url ?? null,
    },
    event: {
      id: event.id,
      title: event.title ?? 'Event',
      starts_at: event.starts_at ?? null,
    },
    amountPaid,
    balanceDue,
  };
}
