'use client';

/**
 * Invoice Feed – list of finance_invoices (QBO mirror) with status badges and Sync Now.
 * Paid = Green Glass, Overdue = Red Glass.
 */

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, FileText } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { syncEventFinancials } from '@/features/finance/sync';
import type { FinanceInvoiceRow } from '@/features/finance/sync';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize';
  if (status === 'paid') {
    return (
      <span className={`${base} bg-[oklch(0.45_0.08_145_/_0.25)] text-[var(--color-unusonic-success)] border border-[oklch(0.65_0.18_145_/_0.2)]`}>
        Paid
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className={`${base} bg-[oklch(0.35_0.08_20_/_0.25)] text-[var(--color-unusonic-error)] border border-[oklch(0.65_0.18_20_/_0.2)]`}>
        Overdue
      </span>
    );
  }
  return (
    <span className={`${base} bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] `}>
      {status === 'open' ? 'Open' : status}
    </span>
  );
}

export interface InvoiceFeedProps {
  workspaceId: string;
  eventId?: string;
  invoices: FinanceInvoiceRow[];
  onSyncComplete?: () => void;
  className?: string;
}

export function InvoiceFeed({
  workspaceId,
  eventId,
  invoices,
  onSyncComplete,
  className,
}: InvoiceFeedProps) {
  const [isPending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncNow = () => {
    const id = eventId ?? invoices[0]?.event_id;
    if (!id) {
      setSyncMessage('No event to sync');
      return;
    }
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncEventFinancials(workspaceId, id);
      if (result.status === 'ok') {
        setSyncMessage(`Synced ${result.invoicesSynced} invoices`);
        onSyncComplete?.();
        setTimeout(() => setSyncMessage(null), 3000);
      } else if (result.status === 'unmapped') {
        setSyncMessage('Event not linked to QuickBooks project');
      } else if (result.status === 'not_connected') {
        setSyncMessage('Connect QuickBooks in Kit');
      } else {
        setSyncMessage(result.error ?? 'Sync failed');
      }
    });
  };

  return (
    <StagePanel className={`overflow-hidden flex flex-col ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
          QBO Invoices
        </h2>
        <motion.button
          type="button"
          onClick={handleSyncNow}
          disabled={isPending || !eventId}
          transition={spring}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            bg-[oklch(1_0_0_/_0.05)] hover:bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]
            disabled:opacity-50 disabled:cursor-not-allowed transition-[color,background-color,filter] hover:brightness-[1.03]"
        >
          {isPending ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Sync Now
        </motion.button>
      </div>

      <AnimatePresence>
        {syncMessage && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-[var(--stage-text-secondary)] mb-2"
          >
            {syncMessage}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="min-h-0 overflow-auto">
        {invoices.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-center text-sm text-[var(--stage-text-secondary)]">
            <FileText className="w-8 h-8 opacity-40" />
            <p>No QBO invoices yet</p>
            {eventId && (
              <p className="text-xs">Link this event to a QuickBooks project, then Sync Now.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[oklch(1_0_0_/_0.08)]">
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Doc #
                </th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Due
                </th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Amount
                </th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={spring}
                  className="border-b border-[oklch(1_0_0_/_0.08)] last:border-b-0"
                >
                  <td className="py-3 pr-4 font-mono text-sm text-[var(--stage-text-primary)]">
                    {inv.qbo_doc_number ?? inv.qbo_id}
                  </td>
                  <td className="py-3 pr-4 text-sm text-[var(--stage-text-secondary)]">
                    {formatDate(inv.due_date)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm text-[var(--stage-text-primary)]">
                    {formatCurrency(inv.amount)}
                  </td>
                  <td className="py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </StagePanel>
  );
}
