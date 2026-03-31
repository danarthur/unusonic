'use client';

import { motion } from 'framer-motion';
import type { PublicInvoiceDTO } from '../../model/public-invoice';
import { InvoiceHeader } from './InvoiceHeader';
import { LineItemTable } from './LineItemTable';
import { PaymentWidget } from './PaymentWidget';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface PublicInvoiceViewProps {
  data: PublicInvoiceDTO;
  token: string;
  className?: string;
}

export function PublicInvoiceView({ data, token, className }: PublicInvoiceViewProps) {
  return (
    <div
      className={cn(
        'flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-20 pt-6 sm:px-6 sm:pt-8',
        className
      )}
      style={{
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <InvoiceHeader data={data} className="mb-6 sm:mb-8" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.04 }}
        className="mb-4 text-xs font-semibold uppercase tracking-widest sm:mb-5"
        style={{ color: 'var(--portal-text-secondary)' }}
      >
        Line items
      </motion.div>
      <LineItemTable items={data.items} className="mb-8 sm:mb-10" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.08 }}
        className="mb-2 text-xs font-semibold uppercase tracking-widest sm:mb-3"
        style={{ color: 'var(--portal-text-secondary)' }}
      >
        Payment
      </motion.div>
      <PaymentWidget
        token={token}
        balanceDue={data.balanceDue}
        className="w-full"
      />

      {/* Attribution */}
      <p
        className="text-center text-[12px] mt-12 pb-4 tracking-[0.08em] uppercase"
        style={{ color: 'var(--portal-text-secondary)', opacity: 0.5 }}
      >
        Powered by Unusonic
      </p>
    </div>
  );
}
