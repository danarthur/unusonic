/**
 * Quick Actions – New Invoice + Generate from Proposal (dropdown when proposals exist)
 * @module features/finance/ui/QuickActions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, ChevronDown } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Button } from '@/shared/ui/button';
import { generateInvoice } from '../api/convertProposalToInvoice';

function DropdownProposals({
  proposalIds,
  loadingProposalId,
  onSelect,
}: {
  proposalIds: { id: string; status: string }[];
  loadingProposalId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-between gap-2"
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <FileText className="size-4" />
          Generate from Proposal
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      {open && (
        <ul className="liquid-panel-nested mt-2 rounded-xl overflow-hidden divide-y divide-[var(--glass-border)]">
          {proposalIds.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-[var(--glass-bg-hover)] transition-colors flex items-center justify-between"
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                }}
                disabled={loadingProposalId === p.id}
              >
                <span className="font-mono text-xs">{p.id.slice(0, 8)}…</span>
                <span className="text-ink-muted capitalize text-xs">
                  {loadingProposalId === p.id ? 'Creating…' : p.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

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
  const [loadingProposalId, setLoadingProposalId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateFromProposal(proposalId: string) {
    setError(null);
    setLoadingProposalId(proposalId);
    const result = await generateInvoice(proposalId, eventId);
    setLoadingProposalId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.invoiceId) {
      router.push(`/events/${eventId}/finance`);
      router.refresh();
    }
  }

  return (
    <LiquidPanel className={`flex flex-col gap-4 ${className ?? ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Actions
      </h2>
      <div className="flex flex-col gap-3">
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <a href={`/invoices/new?eventId=${eventId}`}>
            <Plus className="size-4" />
            New Invoice
          </a>
        </Button>
        {proposalIds.length > 0 ? (
          <div className="relative">
            <DropdownProposals
              proposalIds={proposalIds}
              loadingProposalId={loadingProposalId}
              onSelect={handleGenerateFromProposal}
            />
            {error && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            No proposals available to convert. Create one in the Deal room.
          </p>
        )}
      </div>
    </LiquidPanel>
  );
}
