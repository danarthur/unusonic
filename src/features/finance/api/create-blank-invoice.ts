/**
 * Finance feature — Create blank invoice server action
 *
 * Inserts a draft invoice + line items into finance.invoices / finance.invoice_line_items.
 * Auth: verifies workspace membership via session client, writes via system client.
 *
 * @module features/finance/api/create-blank-invoice
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlankInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  itemKind: string;
}

export interface CreateBlankInvoiceInput {
  workspaceId: string;
  billToEntityId: string;
  billingEmail?: string | null;
  eventId?: string | null;
  dealId?: string | null;
  poNumber?: string | null;
  notesToClient?: string | null;
  terms?: string | null;
  lineItems: BlankInvoiceLineItem[];
}

export interface CreateBlankInvoiceResult {
  invoiceId: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function createBlankInvoice(
  input: CreateBlankInvoiceInput,
): Promise<CreateBlankInvoiceResult> {
  // Verify caller has workspace access
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return { invoiceId: null, error: 'Not authenticated' };
  }

  const { data: membership } = await sessionClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();

  if (!membership) {
    return { invoiceId: null, error: 'Not authorised for this workspace' };
  }

  // Compute totals
  const subtotal = input.lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPrice,
    0,
  );

  // Generate a public token for the invoice link
  const publicToken = crypto.randomUUID();

  const system = getSystemClient();

  // Insert invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
  const { data: invoice, error: insertErr } = await (system as any)
    .schema('finance')
    .from('invoices')
    .insert({
      workspace_id: input.workspaceId,
      invoice_kind: 'standard',
      status: 'draft',
      bill_to_entity_id: input.billToEntityId,
      billing_email: input.billingEmail ?? null,
      event_id: input.eventId ?? null,
      deal_id: input.dealId ?? null,
      po_number: input.poNumber ?? null,
      notes_to_client: input.notesToClient ?? null,
      terms: input.terms ?? null,
      subtotal_amount: subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      paid_amount: 0,
      public_token: publicToken,
    })
    .select('id')
    .single();

  if (insertErr || !invoice) {
    return {
      invoiceId: null,
      error: insertErr?.message ?? 'Failed to create invoice',
    };
  }

  const invoiceId = (invoice as { id: string }).id;

  // Insert line items
  if (input.lineItems.length > 0) {
    const rows = input.lineItems.map((li, idx) => ({
      invoice_id: invoiceId,
      position: idx + 1,
      item_kind: li.itemKind,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      amount: li.quantity * li.unitPrice,
      cost: 0,
      is_taxable: true,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
    const { error: liErr } = await (system as any)
      .schema('finance')
      .from('invoice_line_items')
      .insert(rows);

    if (liErr) {
      // Invoice was created but line items failed — non-fatal, log it
      console.error('[createBlankInvoice] Line items insert failed:', liErr.message);
    }
  }

  revalidatePath('/finance');

  return { invoiceId, error: null };
}
