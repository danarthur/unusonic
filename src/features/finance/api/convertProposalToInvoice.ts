/**
 * Finance feature – Convert a signed proposal to draft invoices
 *
 * Legacy wrapper around spawnInvoicesFromProposal. Kept for backward
 * compatibility with callers that import generateInvoice from this module
 * (e.g., QuickActions.tsx, SetupBilling.tsx). New code should import
 * spawnInvoicesFromProposal from invoice-actions.ts directly.
 *
 * @module features/finance/api/convertProposalToInvoice
 */

import 'server-only';
import { spawnInvoicesFromProposal } from './invoice-actions';

export interface GenerateInvoiceResult {
  invoiceId: string | null;
  error: string | null;
}

/**
 * Create draft invoices from a proposal (deposit + final or standalone).
 * Delegates to spawnInvoicesFromProposal and returns the first invoice ID
 * for backward compat with callers that expect a single invoiceId.
 */
export async function generateInvoice(
  proposalId: string,
  eventId?: string,
): Promise<GenerateInvoiceResult> {
  const result = await spawnInvoicesFromProposal(proposalId, eventId);

  if (result.error) {
    return { invoiceId: null, error: result.error };
  }

  const firstInvoice = result.invoices[0];
  return { invoiceId: firstInvoice?.invoice_id ?? null, error: null };
}
