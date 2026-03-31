'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Building2, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../model/types';
import { submitPublicPayment, type PublicPaymentMethod } from '../../api/public-payment-actions';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface PaymentWidgetProps {
  token: string;
  balanceDue: number;
  className?: string;
}

const MOCK_BANK = {
  bankName: 'Unusonic Mock Bank',
  routing: '021000021',
  account: '****4521',
};

export function PaymentWidget({ token, balanceDue, className }: PaymentWidgetProps) {
  const [tab, setTab] = useState<'credit_card' | 'wire'>('credit_card');
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success state
  if (balanceDue <= 0 || success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
        className={cn(
          'flex flex-col items-center justify-center rounded-[var(--portal-radius)] py-12 sm:py-16',
          className
        )}
        style={{
          border: '1px solid oklch(0.40 0.12 145 / 0.3)',
          backgroundColor: 'oklch(0.95 0.04 145 / 0.15)',
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="mb-4 flex size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: 'oklch(0.95 0.04 145 / 0.3)' }}
        >
          <CheckCircle2 className="size-9" style={{ color: 'oklch(0.40 0.12 145)' }} />
        </motion.div>
        <p
          className="text-2xl font-light tracking-tight sm:text-3xl"
          style={{ color: 'oklch(0.35 0.12 145)' }}
        >
          Paid in Full
        </p>
        <p className="mt-1.5 text-sm" style={{ color: 'oklch(0.40 0.12 145)' }}>
          Thank you for your payment.
        </p>
      </motion.div>
    );
  }

  const handlePay = (method: PublicPaymentMethod) => {
    setError(null);
    startTransition(async () => {
      const result = await submitPublicPayment(token, method);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? 'Something went wrong');
      }
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...spring, delay: 0.1 }}
      className={cn(
        'w-full overflow-hidden rounded-[var(--portal-radius)]',
        className
      )}
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      <div style={{ borderBottom: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}>
        <div className="flex">
          <button
            type="button"
            onClick={() => setTab('credit_card')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors',
              tab === 'credit_card'
                ? 'border-b-2'
                : ''
            )}
            style={tab === 'credit_card'
              ? { borderColor: 'var(--portal-accent)', color: 'var(--portal-text)' }
              : { color: 'var(--portal-text-secondary)' }
            }
          >
            <CreditCard className="size-4" />
            Credit Card
          </button>
          <button
            type="button"
            onClick={() => setTab('wire')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors',
              tab === 'wire'
                ? 'border-b-2'
                : ''
            )}
            style={tab === 'wire'
              ? { borderColor: 'var(--portal-accent)', color: 'var(--portal-text)' }
              : { color: 'var(--portal-text-secondary)' }
            }
          >
            <Building2 className="size-4" />
            Wire Transfer
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {tab === 'credit_card' ? (
            <motion.div
              key="cc"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={spring}
              className="space-y-4"
            >
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Mock payment form
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Card number" className="font-mono" disabled />
                <div className="flex gap-2 sm:col-span-2">
                  <Input placeholder="MM/YY" className="font-mono w-24" disabled />
                  <Input placeholder="CVC" className="font-mono w-20" disabled />
                </div>
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={isPending}
                onClick={() => handlePay('credit_card')}
              >
                {isPending ? 'Processing…' : `Pay ${formatCurrency(balanceDue)}`}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="wire"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring}
              className="space-y-4"
            >
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Bank details
              </p>
              <div
                className="rounded-lg p-4 font-mono text-sm"
                style={{
                  backgroundColor: 'var(--portal-accent-subtle)',
                  border: 'var(--portal-border-width) solid var(--portal-border-subtle)',
                }}
              >
                <p><span style={{ color: 'var(--portal-text-secondary)' }}>Bank:</span> {MOCK_BANK.bankName}</p>
                <p className="mt-1"><span style={{ color: 'var(--portal-text-secondary)' }}>Routing:</span> {MOCK_BANK.routing}</p>
                <p className="mt-1"><span style={{ color: 'var(--portal-text-secondary)' }}>Account:</span> {MOCK_BANK.account}</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--portal-text)' }}>
                  Amount: {formatCurrency(balanceDue)}
                </p>
              </div>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                disabled={isPending}
                onClick={() => handlePay('wire')}
              >
                {isPending ? 'Recording…' : 'I have sent the wire'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-3 text-sm text-[var(--color-unusonic-error)]">{error}</p>
        )}
      </div>
    </motion.section>
  );
}
