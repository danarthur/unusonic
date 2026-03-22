'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { ProposalHero } from './ProposalHero';
import { LineItemGrid } from './LineItemGrid';
import { AcceptanceBar } from './AcceptanceBar';
import { SignProposalDialog } from './SignProposalDialog';
import { DocuSealSignPanel } from './DocuSealSignPanel';
import { ProposalSummaryBlock } from './ProposalSummaryBlock';
import type { PublicProposalDTO } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface PublicProposalViewProps {
  data: PublicProposalDTO;
  token: string;
  className?: string;
}

export function PublicProposalView({ data, token, className }: PublicProposalViewProps) {
  const router = useRouter();
  const [signOpen, setSignOpen] = useState(false);
  const [signed, setSigned] = useState(data.proposal.status === 'accepted');

  const openSign = useCallback(() => setSignOpen(true), []);
  const closeSign = useCallback(() => setSignOpen(false), []);
  const onSignSuccess = useCallback(() => setSigned(true), []);

  const handleDone = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      window.close();
    }
  }, [router]);

  // Signed PDF download href: direct URL if starts with http, otherwise treat as Supabase storage path
  const rawPdfPath = (data.proposal as { signed_pdf_path?: string | null }).signed_pdf_path ?? null;
  const signedPdfHref: string | null = rawPdfPath?.startsWith('http') ? rawPdfPath : null;

  return (
    <div
      className={cn(
        'flex flex-col min-h-dvh w-full max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 overflow-visible',
        className
      )}
      style={{
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <ProposalHero data={data} className="mb-8 sm:mb-10" />

      {!signed && (
        <ProposalSummaryBlock
          eventTitle={data.event.title}
          startsAt={data.event.startsAt}
          total={data.total}
          depositPercent={(data.proposal as { deposit_percent?: number | null }).deposit_percent}
          paymentDueDays={(data.proposal as { payment_due_days?: number | null }).payment_due_days}
          paymentNotes={(data.proposal as { payment_notes?: string | null }).payment_notes}
          className="mb-8"
        />
      )}

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.08 }}
        className="flex-1"
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
          Scope
        </h2>
        <LineItemGrid items={data.items} className="gap-4 sm:gap-5" />
      </motion.section>

      {signed ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className={cn(
            'mt-8 rounded-3xl border border-[var(--glass-border)]',
            'bg-[var(--glass-bg)] backdrop-blur-xl liquid-levitation-strong',
            'px-6 pt-8 pb-8 text-center'
          )}
        >
          <p className="font-serif text-2xl sm:text-3xl font-light text-ink tracking-tight">
            It&apos;s a Date.
          </p>
          <p className="text-sm text-ink-muted mt-2 max-w-sm mx-auto leading-relaxed">
            Your agreement has been recorded. A confirmation has been sent to your email.
          </p>

          {/* Event recap */}
          <div className="mt-5 flex flex-col items-center gap-1 text-sm text-ink">
            <p className="font-medium">{data.event.title}</p>
            {data.event.startsAt && (
              <p className="text-ink-muted">
                {new Date(data.event.startsAt).toLocaleDateString(undefined, {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
            <p className="font-semibold tabular-nums">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(data.total)}
            </p>
          </div>

          {/* Next steps */}
          <p className="mt-5 text-xs text-ink-muted max-w-xs mx-auto leading-relaxed">
            A signed copy has been sent to your email. Reply to that email with any questions — it goes directly to {data.workspace.name}.
          </p>

          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              type="button"
              onClick={handleDone}
              className={cn(
                'rounded-2xl h-10 px-6 font-medium text-sm tracking-tight',
                'border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-ink',
                'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg)]'
              )}
            >
              Close
            </button>
            {signedPdfHref && (
              <a
                href={signedPdfHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-2xl h-10 px-5 font-medium text-sm tracking-tight',
                  'border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-ink-muted hover:text-ink',
                  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg)]'
                )}
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            )}
          </div>
        </motion.div>
      ) : data.embedSrc ? (
        /* DocuSeal e-signature flow */
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
            Sign your proposal
          </h2>
          <DocuSealSignPanel embedSrc={data.embedSrc} />
        </div>
      ) : (
        /* Legacy text-sign flow */
        <AcceptanceBar
          total={data.total}
          onReviewAndSign={openSign}
          className="mt-8"
        />
      )}

      {/* Legacy text-sign dialog — only rendered when no DocuSeal embedSrc */}
      {!data.embedSrc && (
        <SignProposalDialog
          open={signOpen}
          onClose={closeSign}
          token={token}
          onSuccess={onSignSuccess}
        />
      )}
    </div>
  );
}
