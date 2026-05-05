'use server';

/**
 * Finance feature – Invoice server actions
 *
 * Canonical entry points for invoice generation and payment recording.
 * Both functions validate the caller's workspace membership via the session
 * client (RLS), then call the finance.* RPCs via the system client (service
 * role). This pattern matches the DocuSeal webhook and ensures the RPCs'
 * SECURITY DEFINER posture is exercised through a single code path.
 *
 * @module features/finance/api/invoice-actions
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';

// =============================================================================
// Generate invoices from accepted proposal
// =============================================================================

export interface SpawnInvoicesResult {
  invoices: Array<{ invoice_id: string; invoice_kind: string }>;
  error: string | null;
}

/**
 * Calls finance.spawn_invoices_from_proposal(proposal_id).
 * Idempotent: returns existing invoices if already spawned.
 *
 * Auth: verifies the caller can read the proposal (RLS workspace check),
 * then calls the RPC via system client (service role).
 */
export async function spawnInvoicesFromProposal(
  proposalId: string,
  eventId?: string,
): Promise<SpawnInvoicesResult> {
  const sessionClient = await createClient();

  // Verify caller has workspace access to this proposal (RLS enforces membership)
  const { data: proposal, error: authErr } = await sessionClient
    .from('proposals')
    .select('id, workspace_id')
    .eq('id', proposalId)
    .maybeSingle();

  if (authErr || !proposal) {
    return { invoices: [], error: authErr?.message ?? 'Proposal not found or access denied' };
  }

  // Call the RPC via system client (service role — required for SECURITY DEFINER)
  const system = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
  const { data, error } = await system
    .schema('finance')
    .rpc('spawn_invoices_from_proposal', { p_proposal_id: proposalId });

  if (error) {
    return { invoices: [], error: error.message };
  }

  if (eventId) revalidatePath(`/events/${eventId}/finance`);
  revalidatePath('/productions');

  return {
    invoices: (data as Array<{ invoice_id: string; invoice_kind: string }>) ?? [],
    error: null,
  };
}

// Keep legacy export name for callers that haven't migrated yet
export const generateInvoiceFromProposal = spawnInvoicesFromProposal;

// Proxy for sendInvoice — delegates to send-invoice.ts which uses server-only
// imports (generate-invoice-pdf). Can't re-export directly because tsc would
// trace the server-only chain and block client-side module resolution.
export interface SendInvoiceResult {
  success: boolean;
  invoiceNumber: string | null;
  error: string | null;
}

export async function sendInvoice(
  invoiceId: string,
  eventId?: string,
): Promise<SendInvoiceResult> {
  const mod = await import('./send-invoice');
  return mod.sendInvoice(invoiceId, eventId);
}

// =============================================================================
// Record payment (manual or webhook-sourced)
// =============================================================================

export type PaymentMethod =
  | 'stripe_card'
  | 'stripe_ach'
  | 'check'
  | 'wire'
  | 'cash'
  | 'bill_dot_com'
  | 'other';

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  receivedAt?: string;
  reference?: string | null;
  notes?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
  parentPaymentId?: string | null;
  attachmentStoragePath?: string | null;
}

export interface RecordPaymentResult {
  paymentId: string | null;
  error: string | null;
}

/**
 * Canonical payment write path. Routes through finance.record_payment RPC.
 * Both the Stripe webhook and the manual "Record Payment" modal call this.
 *
 * Auth: verifies the caller can read the invoice (RLS workspace check),
 * then calls the RPC via system client. For webhook paths (no session user),
 * call recordPaymentFromWebhook instead.
 */
export async function recordManualPayment(
  input: RecordPaymentInput,
  eventId?: string,
): Promise<RecordPaymentResult> {
  const sessionClient = await createClient();

  // Verify caller has workspace access to this invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: invoice, error: authErr } = await sessionClient
    .schema('finance')
    .from('invoices')
    .select('id')
    .eq('id', input.invoiceId)
    .maybeSingle();

  if (authErr || !invoice) {
    return { paymentId: null, error: authErr?.message ?? 'Invoice not found or access denied' };
  }

  // Get the calling user's ID for the audit trail
  const { data: { user } } = await sessionClient.auth.getUser();

  return callRecordPaymentRpc(input, user?.id ?? null, eventId);
}

/**
 * Payment recording without session auth — for use by webhook handlers
 * that have already verified the Stripe signature.
 */
export async function recordPaymentFromWebhook(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  return callRecordPaymentRpc(input, null);
}

async function callRecordPaymentRpc(
  input: RecordPaymentInput,
  userId: string | null,
  eventId?: string,
): Promise<RecordPaymentResult> {
  const system = getSystemClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: paymentId, error } = await system
    .schema('finance')
    .rpc('record_payment', {
      p_invoice_id: input.invoiceId,
      p_amount: input.amount,
      p_method: input.method,
      p_received_at: input.receivedAt ?? new Date().toISOString(),
      p_reference: input.reference ?? undefined,
      p_notes: input.notes ?? undefined,
      p_stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
      p_stripe_charge_id: input.stripeChargeId ?? undefined,
      p_status: input.status ?? 'succeeded',
      p_recorded_by_user_id: userId ?? undefined,
      p_parent_payment_id: input.parentPaymentId ?? undefined,
      p_attachment_storage_path: input.attachmentStoragePath ?? undefined,
    });

  if (error) {
    return { paymentId: null, error: error.message };
  }

  if (eventId) revalidatePath(`/events/${eventId}/finance`);
  revalidatePath('/productions');
  revalidatePath('/finance');

  return { paymentId: paymentId as string, error: null };
}
