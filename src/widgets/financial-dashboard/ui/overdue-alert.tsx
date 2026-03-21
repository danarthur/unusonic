/**
 * Overdue Invoice Alert Banner
 * Dismissible alert shown at top of finance dashboard when invoices are past due.
 * Renders nothing when no invoices are overdue.
 * @module widgets/financial-dashboard/ui/overdue-alert
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { OutstandingInvoice } from '@/features/finance-sync';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface OverdueAlertProps {
  invoices: OutstandingInvoice[];
  className?: string;
}

export function OverdueAlert({ invoices, className }: OverdueAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const overdue = invoices.filter((inv) => inv.urgency === 'overdue');

  if (overdue.length === 0 || dismissed) return null;

  const totalOverdue = overdue.reduce((sum, inv) => sum + inv.balanceDue, 0);
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={spring}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle className="size-4 text-red-500 dark:text-red-400" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {overdue.length} invoice{overdue.length > 1 ? 's' : ''} overdue
              <span className="ml-1.5 font-normal text-red-600/80 dark:text-red-400/80">
                ({fmt.format(totalOverdue)} outstanding)
              </span>
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {overdue.slice(0, 3).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/events/${inv.eventId}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400 transition-colors"
                >
                  {inv.invoiceNumber || inv.eventName || 'Invoice'}
                  <ChevronRight className="size-3" />
                </Link>
              ))}
              {overdue.length > 3 && (
                <span className="inline-flex items-center px-2 py-1 text-xs text-red-500/70">
                  +{overdue.length - 3} more
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
