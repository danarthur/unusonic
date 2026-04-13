'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createInvoiceCheckoutSession } from '@/features/finance/api/create-invoice-checkout-session';

interface PayNowButtonProps {
  token: string;
  acceptOnlinePayments: boolean;
}

export function PayNowButton({ token, acceptOnlinePayments }: PayNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!acceptOnlinePayments) {
    return (
      <>
        <button
          type="button"
          disabled
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white opacity-50 cursor-not-allowed"
        >
          Pay now
        </button>
        <p className="mt-2 text-center text-xs text-gray-500">
          Online payment isn’t enabled for this account. Reach out to your contact for bank or check details.
        </p>
      </>
    );
  }

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createInvoiceCheckoutSession(token);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? 'Could not start payment');
      Sentry.captureMessage('Invoice Stripe Checkout session failed', {
        level: 'warning',
        extra: { token, resultError: result.error ?? null },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment');
      Sentry.captureException(err, { tags: { area: 'invoice-checkout' }, extra: { token } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirecting to Stripe…' : 'Pay now'}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
      {!error && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Secure payment via Stripe
        </p>
      )}
    </>
  );
}
