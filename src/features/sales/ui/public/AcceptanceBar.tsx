'use client';

import { motion } from 'framer-motion';
import { Fingerprint } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface AcceptanceBarProps {
  total: number;
  onReviewAndSign: () => void;
  disabled?: boolean;
  blockedMessage?: string;
  className?: string;
}

export function AcceptanceBar({
  total,
  onReviewAndSign,
  disabled = false,
  blockedMessage,
  className,
}: AcceptanceBarProps) {
  const isDisabled = disabled || !!blockedMessage;

  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(total);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn(
        'sticky z-20 mt-auto left-0 right-0 overflow-visible',
        'rounded-[var(--portal-radius)] portal-levitation-bar',
        'pt-4 sm:pt-5 px-4 sm:px-6',
        className
      )}
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
        paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))',
      }}
    >
      <div className="mx-auto max-w-2xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-baseline gap-2">
            <span
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              Total
            </span>
            <span
              className="text-xl sm:text-2xl font-semibold tabular-nums tracking-tight"
              style={{ color: 'var(--portal-text)' }}
            >
              {formattedTotal}
            </span>
          </div>
          <button
            type="button"
            onClick={onReviewAndSign}
            disabled={isDisabled}
            className={cn(
              'inline-flex items-center justify-center gap-2 w-full sm:w-auto min-w-[180px] shrink-0',
              'px-6 py-3.5 font-medium text-sm',
              'shadow-[0_2px_8px_oklch(0_0_0_/_0.10)]',
              'hover:shadow-[0_4px_12px_oklch(0_0_0_/_0.14)]',
              'active:brightness-[0.96] transition-[background-color,box-shadow,filter] duration-200',
              'disabled:opacity-50 disabled:pointer-events-none',
              'focus:outline-none focus:ring-2 focus:ring-[var(--portal-accent)] focus:ring-offset-2'
            )}
            style={{
              backgroundColor: 'var(--portal-accent)',
              color: 'var(--portal-accent-text)',
              borderRadius: 'var(--portal-btn-radius)',
            }}
          >
            <Fingerprint className="size-4 opacity-80" aria-hidden />
            Review & Sign
          </button>
        </div>
        {blockedMessage && (
          <p
            className="text-xs text-center sm:text-left"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            {blockedMessage}
          </p>
        )}
      </div>
    </motion.div>
  );
}
