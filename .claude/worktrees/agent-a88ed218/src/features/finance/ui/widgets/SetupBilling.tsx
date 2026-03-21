/**
 * Setup Billing – Empty state when no invoices; prompts to convert active proposal.
 * @module features/finance/ui/widgets/SetupBilling
 */

'use client';

import { useRouter } from 'next/navigation';
import { FileText, ArrowRight } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Button } from '@/shared/ui/button';
import { generateInvoiceFromProposal } from '../../api/invoice-actions';
import { useState } from 'react';

export interface SetupBillingProps {
  eventId: string;
  eventTitle: string;
  proposalIds: { id: string; status: string }[];
  className?: string;
}

export function SetupBilling({
  eventId,
  eventTitle,
  proposalIds,
  className,
}: SetupBillingProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstProposal = proposalIds[0];

  async function handleConvert() {
    if (!firstProposal) return;
    setError(null);
    setLoading(true);
    const result = await generateInvoiceFromProposal(firstProposal.id, eventId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <LiquidPanel
      className={`flex flex-col items-center justify-center gap-6 p-8 text-center ${className ?? ''}`}
    >
      <div className="rounded-2xl bg-[var(--glass-bg-hover)] p-6 flex flex-col items-center gap-4 max-w-sm">
        <div className="rounded-full bg-stone-100 dark:bg-stone-800 p-4">
          <FileText className="size-8 text-ink-muted" aria-hidden />
        </div>
        <h3 className="text-lg font-medium text-ink tracking-tight">
          Setup Billing
        </h3>
        <p className="text-sm text-ink-muted">
          {firstProposal
            ? `Convert your active proposal for ${eventTitle} into an invoice to start tracking payments.`
            : `Create a proposal in the Deal room first, then convert it to an invoice here.`}
        </p>
        {firstProposal ? (
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleConvert}
            disabled={loading}
          >
            {loading ? (
              'Creating…'
            ) : (
              <>
                Convert proposal to invoice
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <a href={`/events/${eventId}/deal`}>Go to Deal room</a>
          </Button>
        )}
        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>
    </LiquidPanel>
  );
}
