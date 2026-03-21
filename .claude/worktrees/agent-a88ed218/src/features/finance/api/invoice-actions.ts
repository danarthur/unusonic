/**
 * Finance feature – Invoice server actions: generate from proposal, record payment
 * @module features/finance/api/invoice-actions
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import type { PaymentMethod } from '@/types/supabase';

// =============================================================================
// Generate invoice from proposal
// =============================================================================

export interface GenerateInvoiceFromProposalResult {
  invoiceId: string | null;
  error: string | null;
}

/**
 * Calls DB function create_draft_invoice_from_proposal(proposal_id).
 * Revalidates event finance page when eventId is provided.
 */
export async function generateInvoiceFromProposal(
  proposalId: string,
  eventId?: string
): Promise<GenerateInvoiceFromProposalResult> {
  const supabase = await createClient();

  const { data: invoiceId, error } = await supabase.rpc(
    'create_draft_invoice_from_proposal',
    { p_proposal_id: proposalId }
  );

  if (error) {
    return { invoiceId: null, error: error.message };
  }

  const id = typeof invoiceId === 'string' ? invoiceId : invoiceId?.[0];
  if (id) {
    if (eventId) revalidatePath(`/events/${eventId}/finance`);
    revalidatePath('/crm');
  }

  return { invoiceId: id ?? null, error: null };
}

// =============================================================================
// Record manual payment
// =============================================================================

export interface RecordManualPaymentResult {
  paymentId: string | null;
  error: string | null;
}

/**
 * Inserts a payment row: invoice_id, amount, method, status='succeeded', reference_id.
 * @param eventId – Optional; when provided, revalidates /events/{eventId}/finance
 */
export async function recordManualPayment(
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  reference?: string | null,
  eventId?: string
): Promise<RecordManualPaymentResult> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      amount: String(amount),
      method,
      status: 'succeeded',
      reference_id: reference ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { paymentId: null, error: error.message };
  }

  if (eventId) revalidatePath(`/events/${eventId}/finance`);
  revalidatePath('/crm');

  return { paymentId: row?.id ?? null, error: null };
}
