'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ProposalHero } from './ProposalHero';
import { LineItemGrid } from './LineItemGrid';
import { AcceptanceBar } from './AcceptanceBar';
import { SignProposalDialog } from './SignProposalDialog';
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
            'sticky z-20 mt-auto left-0 right-0',
            'rounded-3xl border border-[var(--glass-border)]',
            'bg-[var(--glass-bg)] backdrop-blur-xl liquid-levitation-bar',
            'px-6 pt-6 sm:pt-8 text-center'
          )}
          style={{
            bottom: 'env(safe-area-inset-bottom, 0px)',
            paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))',
          }}
        >
          <p className="font-serif text-2xl sm:text-3xl font-light text-ink tracking-tight">
            It&apos;s a Date.
          </p>
          <p className="text-sm text-ink-muted mt-1.5 max-w-sm mx-auto">
            Your signature has been recorded. Thank you.
          </p>
          <button
            type="button"
            onClick={handleDone}
            className={cn(
              'mt-4 rounded-2xl h-10 px-6 font-medium text-sm tracking-tight',
              'border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-ink',
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg)]'
            )}
          >
            Done
          </button>
          <p className="text-xs text-ink-muted mt-2">
            You can close this tab if the page does not change.
          </p>
        </motion.div>
      ) : (
        <AcceptanceBar
          total={data.total}
          onReviewAndSign={openSign}
          className="mt-8"
        />
      )}

      <SignProposalDialog
        open={signOpen}
        onClose={closeSign}
        token={token}
        onSuccess={onSignSuccess}
      />
    </div>
  );
}
