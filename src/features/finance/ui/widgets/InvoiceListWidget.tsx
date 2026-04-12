/**
 * Invoice List Widget — reads from finance.invoices + finance.invoice_balances
 *
 * Dashboard dark theme (Stage Engineering). Supports filtering by workspace,
 * event, or deal scope. Shows status chips, QBO sync status, and inline
 * line item expansion.
 *
 * @module features/finance/ui/widgets/InvoiceListWidget
 */

'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { StagePanel, StageDot } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { formatCurrency } from '../../model/types';
import { PaymentModal } from './PaymentModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceBalanceRow {
  id: string;
  workspace_id?: string;
  invoice_number: string | null;
  invoice_kind: string;
  status: string;
  bill_to_snapshot: {
    display_name: string;
    [key: string]: unknown;
  } | null;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  days_overdue: number;
  due_date: string | null;
  issue_date: string | null;
  public_token: string | null;
  qbo_sync_status: string | null;
  event_id: string | null;
  deal_id: string | null;
  line_items?: LineItemRow[];
}

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  item_kind: string;
}

export type InvoiceStatusFilter =
  | 'all'
  | 'outstanding'
  | 'overdue'
  | 'paid'
  | 'draft'
  | 'void';

export interface InvoiceListWidgetProps {
  invoices: InvoiceBalanceRow[];
  statusFilter?: InvoiceStatusFilter;
  eventId?: string;
  className?: string;
  /** Called after a payment is recorded so the parent can refresh data */
  onDataChange?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function filterInvoices(
  invoices: InvoiceBalanceRow[],
  filter: InvoiceStatusFilter,
): InvoiceBalanceRow[] {
  switch (filter) {
    case 'outstanding':
      return invoices.filter(
        (i) => !['paid', 'void', 'draft'].includes(i.status) && i.balance_due > 0,
      );
    case 'overdue':
      return invoices.filter((i) => i.days_overdue > 0 && i.balance_due > 0);
    case 'paid':
      return invoices.filter((i) => i.status === 'paid');
    case 'draft':
      return invoices.filter((i) => i.status === 'draft');
    case 'void':
      return invoices.filter((i) => i.status === 'void');
    default:
      return invoices;
  }
}

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

function StatusChip({ status, daysOverdue, balanceDue }: {
  status: string;
  daysOverdue: number;
  balanceDue: number;
}) {
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium';

  // Overdue takes precedence when balance is due and days > 0
  if (balanceDue > 0 && daysOverdue > 0 && status !== 'void') {
    return (
      <span className={`${base} bg-[oklch(0.35_0.08_20_/_0.25)] text-[var(--color-unusonic-error)]`}>
        <span className="size-1.5 rounded-full bg-[var(--color-unusonic-error)]" />
        Overdue
      </span>
    );
  }

  switch (status) {
    case 'paid':
      return (
        <span className={`${base} bg-[oklch(0.45_0.08_145_/_0.25)] text-[var(--color-unusonic-success)]`}>
          <span className="size-1.5 rounded-full bg-[var(--color-unusonic-success)]" />
          Paid
        </span>
      );
    case 'partially_paid':
      return (
        <span className={`${base} bg-[oklch(0.45_0.08_85_/_0.25)] text-[oklch(0.75_0.12_85)]`}>
          <span className="size-1.5 rounded-full bg-[oklch(0.75_0.12_85)]" />
          Partial
        </span>
      );
    case 'sent':
      return (
        <span className={`${base} bg-[oklch(0.30_0.06_250_/_0.25)] text-[oklch(0.70_0.10_250)]`}>
          <span className="size-1.5 rounded-full bg-[oklch(0.70_0.10_250)]" />
          Sent
        </span>
      );
    case 'viewed':
      return (
        <span className={`${base} bg-[oklch(0.30_0.04_250_/_0.20)] text-[oklch(0.65_0.08_250)]`}>
          <span className="size-1.5 rounded-full bg-[oklch(0.65_0.08_250)]" />
          Viewed
        </span>
      );
    case 'void':
      return (
        <span className={`${base} bg-[oklch(0.30_0.04_20_/_0.15)] text-[oklch(0.50_0.06_20)]`}>
          Void
        </span>
      );
    case 'refunded':
      return (
        <span className={`${base} bg-[oklch(0.30_0.06_20_/_0.20)] text-[oklch(0.55_0.10_20)]`}>
          Refunded
        </span>
      );
    case 'draft':
    default:
      return (
        <span className={`${base} bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]`}>
          Draft
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// QBO sync chip
// ---------------------------------------------------------------------------

function QboChip({ status }: { status: string | null }) {
  if (!status || status === 'not_connected') {
    return <StageDot status="neutral" label="QBO" />;
  }
  if (status === 'synced') {
    return <StageDot status="success" label="QBO" />;
  }
  if (status === 'pending' || status === 'queued') {
    return <StageDot status="warning" label="QBO" />;
  }
  // failed
  return <StageDot status="error" label="QBO" />;
}

// ---------------------------------------------------------------------------
// Copy link button
// ---------------------------------------------------------------------------

function CopyLinkButton({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!token || typeof window === 'undefined') return;
      const url = `${window.location.origin}/i/${token}`;
      navigator.clipboard.writeText(url).then(
        () => {
          setCopied(true);
          toast.success('Invoice link copied');
          setTimeout(() => setCopied(false), 2000);
        },
        () => toast.error('Failed to copy link'),
      );
    },
    [token],
  );

  if (!token) return null;

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
        <Copy className="size-3.5 text-[var(--color-unusonic-success)]" aria-hidden />
      ) : (
        <Link2 className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Expanded row (line items)
// ---------------------------------------------------------------------------

function ExpandedLineItems({ items }: { items: LineItemRow[] }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 pb-3 pt-0">
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: 'var(--stage-surface-nested)' }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--stage-text-tertiary)]">
                <th className="text-left pb-1.5 font-medium">Description</th>
                <th className="text-right pb-1.5 font-medium">Qty</th>
                <th className="text-right pb-1.5 font-medium">Rate</th>
                <th className="text-right pb-1.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li) => (
                <tr key={li.id} className="text-[var(--stage-text-secondary)]">
                  <td className="py-1">{li.description}</td>
                  <td className="py-1 text-right tabular-nums">{li.quantity}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrency(li.unit_price)}
                  </td>
                  <td className="py-1 text-right tabular-nums font-medium text-[var(--stage-text-primary)]">
                    {formatCurrency(li.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InvoiceListWidget({
  invoices,
  statusFilter = 'all',
  eventId,
  className,
  onDataChange,
}: InvoiceListWidgetProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceBalanceRow | null>(null);

  const filtered = filterInvoices(invoices, statusFilter);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <>
      <StagePanel className={`overflow-hidden flex flex-col ${className ?? ''}`}>
        <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4 shrink-0">
          Invoices
        </h2>

        <div className="min-h-0 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[oklch(1_0_0_/_0.08)]">
                <th className="pb-3 pl-3 pr-2 w-8" />
                <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Invoice
                </th>
                <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] hidden sm:table-cell">
                  Client
                </th>
                <th className="pb-3 pr-4 text-right text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Amount
                </th>
                <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Status
                </th>
                <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] hidden md:table-cell">
                  Due
                </th>
                <th className="pb-3 w-20 text-right text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm text-[var(--stage-text-secondary)]"
                  >
                    No invoices yet. Create your first invoice from an accepted proposal.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const isExpanded = expandedId === inv.id;
                  return (
                    <Fragment key={inv.id}>
                      <tr
                        className="border-b border-[oklch(1_0_0_/_0.06)] last:border-b-0 cursor-pointer transition-colors hover:bg-[oklch(1_0_0_/_0.03)]"
                        onClick={() => toggleExpand(inv.id)}
                      >
                        <td className="py-3 pl-3 pr-2">
                          {isExpanded ? (
                            <ChevronDown className="size-3.5 text-[var(--stage-text-tertiary)]" />
                          ) : (
                            <ChevronRight className="size-3.5 text-[var(--stage-text-tertiary)]" />
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm text-[var(--stage-text-primary)]">
                          {inv.invoice_number ?? `Draft`}
                        </td>
                        <td className="py-3 pr-4 text-sm text-[var(--stage-text-secondary)] hidden sm:table-cell truncate max-w-[160px]">
                          {inv.bill_to_snapshot?.display_name ?? '\u2014'}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-sm text-[var(--stage-text-primary)] tabular-nums">
                          {formatCurrency(Number(inv.total_amount))}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusChip
                            status={inv.status}
                            daysOverdue={inv.days_overdue}
                            balanceDue={inv.balance_due}
                          />
                        </td>
                        <td className="py-3 pr-4 text-sm text-[var(--stage-text-secondary)] hidden md:table-cell">
                          {formatDate(inv.due_date)}
                        </td>
                        <td
                          className="py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <CopyLinkButton token={inv.public_token} />
                            <QboChip status={inv.qbo_sync_status} />
                          </div>
                        </td>
                      </tr>
                      {isExpanded && inv.line_items && inv.line_items.length > 0 && (
                        <ExpandedLineItems items={inv.line_items} />
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </StagePanel>

      {/* Payment modal */}
      {paymentInvoice && (
        <PaymentModal
          invoiceId={paymentInvoice.id}
          balanceDue={paymentInvoice.balance_due}
          eventId={eventId}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            setPaymentInvoice(null);
            onDataChange?.();
          }}
        />
      )}
    </>
  );
}
