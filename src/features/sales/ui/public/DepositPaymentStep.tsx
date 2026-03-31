'use client';

/**
 * DepositPaymentStep — inline Stripe deposit collection shown after a proposal is signed.
 * Renders only when: proposal.status === 'accepted' && deposit_percent > 0 && deposit_paid_at is null.
 * @module features/sales/ui/public/DepositPaymentStep
 */

import { useEffect, useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck } from 'lucide-react';
import { createProposalDepositIntent } from '@/features/finance/api/create-proposal-deposit-intent';
import type { CreateDepositIntentResult } from '@/features/finance/api/create-proposal-deposit-intent';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// =============================================================================
// Inner payment form (rendered inside <Elements> provider)
// =============================================================================

interface PaymentFormProps {
  depositCents: number;
  onSuccess: () => void;
}

function PaymentForm({ depositCents, onSuccess }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (submitError) {
      setError(submitError.message ?? 'Payment failed. Please try again.');
      setSubmitting(false);
      return;
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />
      {error && (
        <p className="text-xs text-[var(--color-unusonic-error)] leading-snug">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className={cn(
          'w-full h-11 font-medium text-sm tracking-tight',
          'hover:opacity-90 transition-opacity',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]'
        )}
        style={{
          backgroundColor: 'var(--portal-accent)',
          color: 'var(--portal-accent-text)',
          borderRadius: 'var(--portal-btn-radius)',
        }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing…
          </span>
        ) : (
          `Pay deposit · ${formatCurrency(depositCents)}`
        )}
      </button>
    </form>
  );
}

// =============================================================================
// Outer component — fetches intent, renders Elements provider
// =============================================================================

interface DepositPaymentStepProps {
  token: string;
  total: number;
  depositPercent: number;
}

export function DepositPaymentStep({ token, total, depositPercent }: DepositPaymentStepProps) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depositCents = Math.round((total * depositPercent) / 100) * 100;

  useEffect(() => {
    createProposalDepositIntent(token).then((result: CreateDepositIntentResult) => {
      if (result.alreadyPaid) {
        setAlreadyPaid(true);
      } else if (result.error) {
        setError(result.error);
      } else if (result.clientSecret) {
        setClientSecret(result.clientSecret);
      }
      setLoading(false);
    });
  }, [token]);

  const handleSuccess = useCallback(() => {
    setTimeout(() => router.refresh(), 2000);
  }, [router]);

  if (alreadyPaid) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="mt-6 rounded-[var(--portal-radius)] px-6 py-6"
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck className="w-4 h-4 text-[var(--color-unusonic-success)]" />
        <p
          className="text-sm font-medium tracking-tight"
          style={{ color: 'var(--portal-text)' }}
        >
          Secure your date · {depositPercent}% deposit
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: 'var(--portal-text-secondary)' }}
          />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <p className="text-sm" style={{ color: 'var(--portal-text-secondary)' }}>{error}</p>
      )}

      {/* Stripe Elements — light theme for portal */}
      {clientSecret && !loading && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: 'oklch(0.20 0 0)',
                colorBackground: 'oklch(0.97 0.003 80)',
                colorText: 'oklch(0.13 0.004 50)',
                colorDanger: 'oklch(0.50 0.18 20)',
                borderRadius: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              },
            },
          }}
        >
          <PaymentForm depositCents={depositCents} onSuccess={handleSuccess} />
        </Elements>
      )}

      {/* Secure payment notice */}
      <p
        className="mt-4 text-[11px] leading-relaxed"
        style={{ color: 'var(--portal-text-secondary)' }}
      >
        Payments are processed securely by Stripe. Your card details are never stored by Unusonic.
      </p>
    </motion.div>
  );
}
