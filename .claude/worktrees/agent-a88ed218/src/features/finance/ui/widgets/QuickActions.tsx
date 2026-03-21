/**
 * Quick Actions – "Create Invoice" dropdown: From Proposal | Blank
 * @module features/finance/ui/widgets/QuickActions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, FilePlus, ChevronDown } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Button } from '@/shared/ui/button';
import { generateInvoiceFromProposal } from '../../api/invoice-actions';

export interface QuickActionsProps {
  eventId: string;
  proposalIds: { id: string; status: string }[];
  className?: string;
}

export function QuickActions({
  eventId,
  proposalIds,
  className,
}: QuickActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingProposalId, setLoadingProposalId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleFromProposal() {
    const first = proposalIds[0];
    if (!first) return;
    setError(null);
    setLoadingProposalId(first.id);
    const result = await generateInvoiceFromProposal(first.id, eventId);
    setLoadingProposalId(null);
    setOpen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.invoiceId) {
      router.refresh();
    }
  }

  function handleBlank() {
    setOpen(false);
    window.location.href = `/invoices/new?eventId=${eventId}`;
  }

  const hasProposals = proposalIds.length > 0;

  return (
    <LiquidPanel className={`flex flex-col gap-4 ${className ?? ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Actions
      </h2>
      <div className="relative">
        <div className="relative">
          <Button
            variant="outline"
            className="w-full justify-between gap-2"
            type="button"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" />
              Create Invoice
            </span>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
          {open && (
            <ul className="liquid-panel-nested mt-2 rounded-xl overflow-hidden divide-y divide-[var(--glass-border)]">
              <li>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-[var(--glass-bg-hover)] transition-colors flex items-center gap-3"
                  onClick={handleBlank}
                >
                  <FilePlus className="size-4 text-ink-muted" />
                  Blank
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-[var(--glass-bg-hover)] transition-colors flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleFromProposal}
                  disabled={!hasProposals || loadingProposalId !== null}
                >
                  <span className="flex items-center gap-3">
                    <FileText className="size-4 text-ink-muted" />
                    From Proposal
                  </span>
                  {loadingProposalId && (
                    <span className="text-ink-muted text-xs">Creating…</span>
                  )}
                </button>
              </li>
            </ul>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    </LiquidPanel>
  );
}
