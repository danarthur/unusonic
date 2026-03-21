'use client';

import { motion } from 'framer-motion';
import { Fingerprint } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface AcceptanceBarProps {
  total: number;
  onReviewAndSign: () => void;
  disabled?: boolean;
  className?: string;
}

export function AcceptanceBar({
  total,
  onReviewAndSign,
  disabled = false,
  className,
}: AcceptanceBarProps) {
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
        'rounded-3xl border border-[var(--glass-border)]',
        'bg-[var(--glass-bg)] backdrop-blur-xl liquid-levitation-bar',
        'pt-4 sm:pt-5 px-4 sm:px-6',
        className
      )}
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)",
        paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      <div className="mx-auto max-w-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Total
          </span>
          <span className="text-xl sm:text-2xl font-semibold text-ink tabular-nums tracking-tight">
            {formattedTotal}
          </span>
        </div>
        <button
          type="button"
          onClick={onReviewAndSign}
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-center gap-2 w-full sm:w-auto min-w-[180px] shrink-0',
            'px-6 py-3.5 rounded-2xl font-medium text-sm',
            'bg-ink text-canvas',
            'shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]',
            'hover:bg-walnut active:scale-[0.98] transition-all duration-200',
            'disabled:opacity-50 disabled:pointer-events-none',
            'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)]'
          )}
        >
          <Fingerprint className="size-4 opacity-80" aria-hidden />
          Review & Sign
        </button>
      </div>
    </motion.div>
  );
}
