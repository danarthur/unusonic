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
      className={cn('w-full overflow-hidden rounded-[var(--portal-radius)]', className)}
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-left">
          <thead>
            <tr style={{ borderBottom: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}>
              <th
                className="px-4 py-3 text-xs font-semibold uppercase tracking-widest sm:px-6"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Description
              </th>
              <th
                className="w-16 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest sm:w-20 sm:px-4"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Qty
              </th>
              <th
                className="w-24 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest sm:w-28 sm:px-4"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Price
              </th>
              <th
                className="w-24 px-2 py-3 text-right text-xs font-semibold uppercase tracking-widest sm:w-28 sm:px-4 sm:pr-6"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
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
                style={{ borderBottom: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}
                className="last:border-b-0"
              >
                <td className="px-4 py-3 text-sm sm:px-6" style={{ color: 'var(--portal-text)' }}>
                  {row.description}
                </td>
                <td
                  className="px-2 py-3 text-right font-mono text-sm sm:px-4"
                  style={{ color: 'var(--portal-text)' }}
                >
                  {row.quantity}
                </td>
                <td
                  className="px-2 py-3 text-right font-mono text-sm sm:px-4"
                  style={{ color: 'var(--portal-text)' }}
                >
                  {formatCurrency(Number(row.unit_price))}
                </td>
                <td
                  className="px-2 py-3 text-right font-mono text-sm sm:px-4 sm:pr-6"
                  style={{ color: 'var(--portal-text)' }}
                >
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
