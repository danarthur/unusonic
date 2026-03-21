/**
 * Finance feature – Public payment actions (client portal)
 * Mock: create payment for remaining balance, mark invoice paid, revalidate.
 * @module features/finance/api/public-payment-actions
 */

'use server';

import { revalidatePath } from 'next/cache';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getPublicInvoice } from './get-public-invoice';

// =============================================================================
// Types
// =============================================================================

export type PublicPaymentMethod = 'credit_card' | 'wire';

export interface SubmitPublicPaymentResult {
  success: boolean;
  error: string | null;
}

// =============================================================================
// Server action
// =============================================================================

/**
 * Find invoice by token, create a payment for the full remaining balance,
 * update invoice status to 'paid', revalidate the public invoice path.
 */
export async function submitPublicPayment(
  token: string,
  method: PublicPaymentMethod
): Promise<SubmitPublicPaymentResult> {
  if (!token?.trim()) {
    return { success: false, error: 'Invalid token' };
  }

  const data = await getPublicInvoice(token);
  if (!data) {
    return { success: false, error: 'Invoice not found' };
  }

  if (data.balanceDue <= 0) {
    return { success: true, error: null };
  }

  const supabase = getSystemClient();
  const db = supabase as any;

  // 1. Create payment for full remaining balance
  const { error: payError } = await db.from('payments').insert({
    invoice_id: data.invoice.id,
    workspace_id: data.workspace.id,
    amount: data.balanceDue,
    method,
    status: 'succeeded',
    reference_id: `public-${method}-${Date.now()}`,
  });

  if (payError) {
    return { success: false, error: payError.message };
  }

  // 2. Update invoice status to paid
  const { error: updateError } = await db
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', data.invoice.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath(`/i/${token}`);
  return { success: true, error: null };
}
