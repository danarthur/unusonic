/**
 * Finance feature – Create Stripe Checkout Session for public invoice payment
 * @module features/finance/api/create-checkout-session
 */

'use server';

import { getStripe } from '@/shared/api/stripe/server';
import { getPublicInvoice } from './get-public-invoice';

// =============================================================================
// Types
// =============================================================================

export interface CreateCheckoutSessionResult {
  url: string | null;
  error: string | null;
}

// =============================================================================
// Server action
// =============================================================================

/**
 * Creates a Stripe Checkout Session for the invoice identified by token.
 * Amount is converted to cents once here — the single source of truth for that conversion.
 */
export async function createCheckoutSession(
  token: string,
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { url: null, error: 'Payments are not configured' };
  }

  if (!token?.trim()) {
    return { url: null, error: 'Invalid invoice token' };
  }

  const data = await getPublicInvoice(token);
  if (!data) {
    return { url: null, error: 'Invoice not found' };
  }

  if (data.balanceDue <= 0) {
    return { url: null, error: 'Invoice is already paid' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(data.balanceDue * 100),
            product_data: {
              name: `Invoice ${data.invoice.invoice_number ?? data.invoice.id}`,
              description: `${data.workspace.name} — ${data.event.title}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: data.invoice.id,
        workspace_id: data.workspace.id,
        invoice_token: token,
      },
      success_url: `${baseUrl}/i/${token}?payment=success`,
      cancel_url: `${baseUrl}/i/${token}?payment=cancelled`,
    });

    if (!session.url) {
      return { url: null, error: 'Stripe did not return a checkout URL' };
    }

    return { url: session.url, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed';
    console.error('[Stripe] createCheckoutSession error:', message);
    return { url: null, error: message };
  }
}
