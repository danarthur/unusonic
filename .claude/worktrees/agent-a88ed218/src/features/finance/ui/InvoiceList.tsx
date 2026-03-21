/**
 * Invoice List – Ledger table: ID, Date, Amount, Status; View links to /invoices/[id]
 * @module features/finance/ui/InvoiceList
 */

'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Button } from '@/shared/ui/button';
import { formatCurrency } from '../model/types';
import type { InvoiceDTO } from '../model/types';

function getInvoicePaymentUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/i/${token}`;
}

function CopyInvoiceLinkButton({ invoice }: { invoice: InvoiceDTO }) {
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = getInvoicePaymentUrl(invoice.token);
      if (!url) return;
      navigator.clipboard.writeText(url).then(
        () => toast.success('Invoice link copied'),
        () => toast.error('Failed to copy link')
      );
    },
    [invoice.token]
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label="Copy payment link"
      title="Copy payment link"
      className="gap-1.5 shrink-0"
    >
      <Link2 className="size-4" />
      Copy link
    </Button>
  );
}

export interface InvoiceListProps {
  invoices: InvoiceDTO[];
  className?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize';
  if (status === 'paid') {
    return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`}>Paid</span>;
  }
  if (status === 'draft') {
    return <span className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}>Draft</span>;
  }
  if (status === 'overdue') {
    return <span className={`${base} bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300`}>Overdue</span>;
  }
  if (status === 'sent') {
    return <span className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}>Sent</span>;
  }
  if (status === 'cancelled') {
    return <span className={`${base} bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-500`}>Cancelled</span>;
  }
  return <span className={`${base} bg-stone-100 text-stone-600`}>{status}</span>;
}

export function InvoiceList({ invoices, className }: InvoiceListProps) {
  return (
    <LiquidPanel className={`overflow-hidden flex flex-col ${className ?? ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4 shrink-0">
        Invoices
      </h2>
      <div className="min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                ID
              </th>
              <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                Date
              </th>
              <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                Amount
              </th>
              <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                Status
              </th>
              <th className="pb-3 w-32 text-right text-xs font-semibold uppercase tracking-widest text-ink-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-ink-muted">
                  No invoices yet
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-[var(--glass-border)] last:border-b-0"
                >
                  <td className="py-3 pr-4 font-mono text-sm text-ink">
                    {inv.invoice_number ?? inv.id.slice(0, 8)}
                  </td>
                  <td className="py-3 pr-4 text-sm text-ink-muted">
                    {formatDate(inv.issue_date)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm text-ink">
                    {formatCurrency(Number(inv.total_amount))}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <CopyInvoiceLinkButton invoice={inv} />
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/invoices/${inv.id}`}>View</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </LiquidPanel>
  );
}
