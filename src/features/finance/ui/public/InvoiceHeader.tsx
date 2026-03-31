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
          ? 'border-[oklch(0.40_0.12_145_/_0.3)] bg-[oklch(0.95_0.04_145_/_0.3)] text-[oklch(0.35_0.12_145)]'
          : 'border-[oklch(0.55_0.12_70_/_0.3)] bg-[oklch(0.95_0.04_70_/_0.3)] text-[oklch(0.45_0.12_70)]'
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
        'w-full rounded-[var(--portal-radius)] p-6 sm:p-8 portal-levitation-strong',
        className
      )}
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {workspace.logo_url ? (
              <img
                src={workspace.logo_url}
                alt={workspace.name}
                className="h-9 w-auto object-contain sm:h-10"
              />
            ) : (
              <p
                className="text-xs font-medium uppercase tracking-[0.2em]"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                {workspace.name}
              </p>
            )}
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div>
          <p className="text-base sm:text-lg" style={{ color: 'var(--portal-text-secondary)' }}>
            Invoice
          </p>
          <h1
            className="text-2xl sm:text-3xl"
            style={{
              color: 'var(--portal-text)',
              fontFamily: 'var(--portal-font-heading)',
              fontWeight: 'var(--portal-heading-weight)',
              letterSpacing: 'var(--portal-heading-tracking)',
            }}
          >
            {event.title}
          </h1>
          {invoice.invoice_number && (
            <p
              className="mt-1 font-mono text-sm"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              {invoice.invoice_number}
            </p>
          )}
          {eventDate && (
            <p
              className="mt-1 flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              <Calendar className="size-4 shrink-0" />
              {eventDate}
            </p>
          )}
        </div>

        <div
          className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-end sm:justify-between sm:pt-8"
          style={{ borderTop: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              Total due
            </p>
            <p
              className="font-mono text-2xl font-medium sm:text-3xl"
              style={{ color: 'var(--portal-text)' }}
            >
              {formatCurrency(Number(invoice.total_amount))}
            </p>
          </div>
          <div className="text-sm" style={{ color: 'var(--portal-text-secondary)' }}>
            <p className="font-medium" style={{ color: 'var(--portal-text)' }}>{dueFormatted}</p>
            <p className="mt-0.5">{getDueCountdown(invoice.due_date)}</p>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
