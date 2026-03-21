/**
 * Invoice List – Ledger: ID | Date | Amount | Status. Row click opens Invoice Drawer (placeholder).
 * Status pills: Paid (Green), Draft (Gray), Overdue (Red).
 * @module features/finance/ui/widgets/InvoiceList
 */

'use client';

import { useState, useCallback } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Button } from '@/shared/ui/button';
import { formatCurrency } from '../../model/types';
import type { InvoiceDTO } from '../../model/types';

function getInvoicePaymentUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/i/${token}`;
}

function CopyInvoiceLinkButton({ invoice }: { invoice: InvoiceDTO }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = getInvoicePaymentUrl(invoice.token);
      if (!url) return;
      navigator.clipboard.writeText(url).then(
        () => {
          setCopied(true);
          toast.success('Invoice link copied');
          setTimeout(() => setCopied(false), 2000);
        },
        () => toast.error('Failed to copy link')
      );
    },
    [invoice.token]
  );

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label="Copy payment link"
      title="Copy payment link"
      className="shrink-0"
    >
      {copied ? (
        <Copy className="size-4 text-emerald-600" aria-hidden />
      ) : (
        <Link2 className="size-4" aria-hidden />
      )}
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

function StatusPill({ status }: { status: string }) {
  const base =
    'inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize';
  if (status === 'paid') {
    return (
      <span
        className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`}
      >
        Paid
      </span>
    );
  }
  if (status === 'draft') {
    return (
      <span
        className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}
      >
        Draft
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span
        className={`${base} bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300`}
      >
        Overdue
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span
        className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}
      >
        Sent
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span
        className={`${base} bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-500`}
      >
        Cancelled
      </span>
    );
  }
  return <span className={`${base} bg-stone-100 text-stone-600`}>{status}</span>;
}

/** Placeholder drawer – to be replaced with full Invoice Drawer */
function InvoiceDrawerPlaceholder({
  invoice,
  onClose,
}: {
  invoice: InvoiceDTO | null;
  onClose: () => void;
}) {
  if (!invoice) return null;
  const paymentUrl = typeof window !== 'undefined' ? `${window.location.origin}/i/${invoice.token}` : '';

  const handleCopyLink = () => {
    if (!paymentUrl) return;
    navigator.clipboard.writeText(paymentUrl).then(
      () => toast.success('Invoice link copied'),
      () => toast.error('Failed to copy link')
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/50 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice details"
    >
      <div
        className="liquid-panel w-full max-w-lg max-h-[80vh] overflow-auto rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-lg font-medium text-ink">
            {invoice.invoice_number ?? invoice.id.slice(0, 8)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-[var(--glass-bg-hover)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-ink-muted mb-4">
          Invoice detail view — coming soon. ID: {invoice.id.slice(0, 8)}…
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="gap-2"
        >
          <Link2 className="size-4" />
          Copy payment link
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 ml-0 block text-sm text-ink-muted hover:text-ink underline"
        >
          Close
        </button>
      </div>
      <button
        type="button"
        className="absolute inset-0 -z-10"
        aria-label="Close overlay"
        onClick={onClose}
      />
    </div>
  );
}

export function InvoiceList({ invoices, className }: InvoiceListProps) {
  const [drawerInvoice, setDrawerInvoice] = useState<InvoiceDTO | null>(null);

  return (
    <>
      <LiquidPanel
        className={`overflow-hidden flex flex-col ${className ?? ''}`}
      >
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
                <th className="pb-3 w-12 text-right text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-ink-muted"
                  >
                    No invoices yet
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-[var(--glass-border)] last:border-b-0 liquid-panel-hover cursor-pointer transition-colors"
                    onClick={() => setDrawerInvoice(inv)}
                  >
                    <td className="py-3 pr-4 font-mono text-sm text-ink">
                      {inv.invoice_number ?? `INV-${inv.id.slice(0, 8)}`}
                    </td>
                    <td className="py-3 pr-4 text-sm text-ink-muted">
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-ink">
                      {formatCurrency(Number(inv.total_amount))}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="py-3 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <CopyInvoiceLinkButton invoice={inv} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </LiquidPanel>
      <InvoiceDrawerPlaceholder
        invoice={drawerInvoice}
        onClose={() => setDrawerInvoice(null)}
      />
    </>
  );
}
