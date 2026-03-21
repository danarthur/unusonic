/**
 * Finance feature – Convert a signed proposal to a draft invoice
 * Calls Supabase RPC create_draft_invoice_from_proposal, revalidates finance page.
 * @module features/finance/api/convertProposalToInvoice
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';

export interface GenerateInvoiceResult {
  invoiceId: string | null;
  error: string | null;
}

/**
 * Create a draft invoice from a proposal (header + line items).
 * Call after proposal is signed or from "Generate from Proposal" in the UI.
 * @param proposalId – Proposal UUID
 * @param eventId – Optional event ID to revalidate the event finance page
 */
export async function generateInvoice(
  proposalId: string,
  eventId?: string
): Promise<GenerateInvoiceResult> {
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
