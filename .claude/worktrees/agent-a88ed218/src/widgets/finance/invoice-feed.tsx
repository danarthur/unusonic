'use client';

/**
 * Invoice Feed – list of finance_invoices (QBO mirror) with status badges and Sync Now.
 * Paid = Green Glass, Overdue = Red Glass.
 */

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, FileText } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
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
      <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-500/20`}>
        Paid
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className={`${base} bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200/50 dark:border-rose-500/20`}>
        Overdue
      </span>
    );
  }
  return (
    <span className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}>
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
    <LiquidPanel className={`overflow-hidden flex flex-col ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          QBO Invoices
        </h2>
        <motion.button
          type="button"
          onClick={handleSyncNow}
          disabled={isPending || !eventId}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={spring}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            bg-ink/5 hover:bg-ink/10 text-ink-muted hover:text-ink
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            className="text-xs text-ink-muted mb-2"
          >
            {syncMessage}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="min-h-0 overflow-auto">
        {invoices.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-center text-sm text-ink-muted">
            <FileText className="w-8 h-8 opacity-40" />
            <p>No QBO invoices yet</p>
            {eventId && (
              <p className="text-xs">Link this event to a QuickBooks project, then Sync Now.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  Doc #
                </th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  Due
                </th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  Amount
                </th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
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
                  className="border-b border-[var(--glass-border)] last:border-b-0"
                >
                  <td className="py-3 pr-4 font-mono text-sm text-ink">
                    {inv.qbo_doc_number ?? inv.qbo_id}
                  </td>
                  <td className="py-3 pr-4 text-sm text-ink-muted">
                    {formatDate(inv.due_date)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm text-ink">
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
    </LiquidPanel>
  );
}
