'use client';

import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import type { PublicInvoiceDTO } from '../../model/public-invoice';
import { formatCurrency } from '../../model/types';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface InvoiceHeaderProps {
  data: PublicInvoiceDTO;
  className?: string;
}

function getDueCountdown(dueDate: string): string {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  return `Due in ${diffDays} days`;
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === 'paid';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest',
        isPaid
          ? 'border-emerald-200/80 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/90 dark:text-emerald-200'
          : 'border-amber-200/80 bg-amber-50/95 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/90 dark:text-amber-200'
      )}
    >
      {isPaid ? 'Paid' : 'Due'}
    </span>
  );
}

export function InvoiceHeader({ data, className }: InvoiceHeaderProps) {
  const { invoice, workspace, event } = data;
  const dueFormatted = new Date(invoice.due_date).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const eventDate = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn(
        'w-full rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 shadow-[var(--glass-shadow)] backdrop-blur-xl sm:p-8',
        'liquid-levitation-strong',
        className
      )}
    >
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {workspace.logo_url ? (
              <img
                src={workspace.logo_url}
                alt={workspace.name}
                className="h-9 w-auto object-contain opacity-90 sm:h-10"
              />
            ) : (
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                {workspace.name}
              </p>
            )}
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div>
          <p className="font-serif text-base text-ink-muted sm:text-lg">Invoice</p>
          <h1
            className="font-serif text-2xl font-light tracking-tight text-ink sm:text-3xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            {event.title}
          </h1>
          {invoice.invoice_number && (
            <p className="mt-1 font-mono text-sm text-ink-muted">{invoice.invoice_number}</p>
          )}
          {eventDate && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <Calendar className="size-4 shrink-0" />
              {eventDate}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--glass-border)] pt-6 sm:flex-row sm:items-end sm:justify-between sm:pt-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Total due
            </p>
            <p className="font-mono text-2xl font-medium text-ink sm:text-3xl">
              {formatCurrency(Number(invoice.total_amount))}
            </p>
          </div>
          <div className="text-sm text-ink-muted">
            <p className="font-medium text-ink">{dueFormatted}</p>
            <p className="mt-0.5">{getDueCountdown(invoice.due_date)}</p>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
