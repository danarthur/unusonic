'use client';

import { motion } from 'framer-motion';
import type { PublicInvoiceItemDTO } from '../../model/public-invoice';
import { formatCurrency } from '../../model/types';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface LineItemTableProps {
  items: PublicInvoiceItemDTO[];
  className?: string;
}

export function LineItemTable({ items, className }: LineItemTableProps) {
  if (!items.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...spring, delay: 0.06 }}
      className={cn(
        'w-full overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow-nested)] backdrop-blur-xl',
        'liquid-panel-nested',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-ink-muted sm:px-6">
                Description
              </th>
              <th className="w-16 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest text-ink-muted sm:w-20 sm:px-4">
                Qty
              </th>
              <th className="w-24 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest text-ink-muted sm:w-28 sm:px-4">
                Price
              </th>
              <th className="w-24 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest text-ink-muted sm:w-28 sm:px-4 sm:pr-6">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.08 + i * 0.03 }}
                className="border-b border-[var(--glass-border)] last:border-b-0"
              >
                <td className="px-4 py-3 text-sm text-ink sm:px-6">{row.description}</td>
                <td className="px-2 py-3 text-right font-mono text-sm text-ink sm:px-4">
                  {row.quantity}
                </td>
                <td className="px-2 py-3 text-right font-mono text-sm text-ink sm:px-4">
                  {formatCurrency(Number(row.unit_price))}
                </td>
                <td className="px-2 py-3 text-right font-mono text-sm text-ink sm:px-4 sm:pr-6">
                  {formatCurrency(Number(row.amount))}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
