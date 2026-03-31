'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { ProposalHero } from './ProposalHero';
import { LineItemGrid } from './LineItemGrid';
import { AcceptanceBar } from './AcceptanceBar';
import { SignProposalDialog } from './SignProposalDialog';
import { DocuSealSignPanel } from './DocuSealSignPanel';
import { ProposalSummaryBlock } from './ProposalSummaryBlock';
import { ProposalTOC } from './ProposalTOC';
import { TrackView } from './TrackView';
import { DepositPaymentStep } from './DepositPaymentStep';
import type { PublicProposalDTO } from '../../model/public-proposal';
import { saveClientSelections } from '../../api/save-client-selections';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: STAGE_LIGHT },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SignedConfirmation({
  data,
  signedPdfHref,
  onDone,
}: {
  data: PublicProposalDTO;
  signedPdfHref: string | null;
  onDone: () => void;
}) {
  const depositPercent = (data.proposal as { deposit_percent?: number | null }).deposit_percent;
  const depositDollars =
    depositPercent && depositPercent > 0 ? (data.total * depositPercent) / 100 : null;

  const nextSteps: string[] = [];
  if (depositDollars) {
    nextSteps.push(`Deposit of ${formatCurrency(depositDollars)} due to confirm your date.`);
  }
  nextSteps.push('Your production team will reach out with next steps.');
  nextSteps.push('A signed copy is on its way to your inbox.');

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mt-8 rounded-[var(--portal-radius)] portal-levitation-strong px-6 pt-8 pb-8"
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
        boxShadow:
          '0 1px 3px oklch(0 0 0 / 0.06), 0 8px 24px -6px oklch(0 0 0 / 0.10), 0 0 48px -12px oklch(0.40 0.12 145 / 0.12)',
      }}
    >
      {/* Headline */}
      <motion.div variants={itemVariants} className="text-center">
        <p
          className="text-2xl sm:text-3xl"
          style={{
            color: 'var(--portal-text)',
            fontFamily: 'var(--portal-font-heading)',
            fontWeight: 'var(--portal-heading-weight)',
            letterSpacing: 'var(--portal-heading-tracking)',
          }}
        >
          It&apos;s a Date.
        </p>
        <p
          className="text-sm mt-2 leading-relaxed"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Your agreement is on record.
        </p>
      </motion.div>

      {/* Event recap */}
      <motion.div
        variants={itemVariants}
        className="mt-5 rounded-lg px-5 py-4 flex flex-col gap-0.5"
        style={{
          backgroundColor: 'var(--portal-accent-subtle)',
          border: 'var(--portal-border-width) solid var(--portal-border-subtle)',
        }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
          {data.event.title}
        </p>
        {data.event.startsAt && (
          <p className="text-sm" style={{ color: 'var(--portal-text-secondary)' }}>
            {new Date(data.event.startsAt).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--portal-text)' }}>
          {formatCurrency(data.total)}
        </p>
      </motion.div>

      {/* What happens next */}
      <motion.div variants={itemVariants} className="mt-6">
        <p
          className="mb-3"
          style={{
            color: 'var(--portal-text-secondary)',
            fontSize: 'var(--portal-label-size)',
            fontWeight: 'var(--portal-label-weight)',
            letterSpacing: 'var(--portal-label-tracking)',
            textTransform: 'var(--portal-label-transform)' as React.CSSProperties['textTransform'],
          }}
        >
          What happens next
        </p>
        <motion.ol variants={containerVariants} className="flex flex-col gap-2.5">
          {nextSteps.map((step, i) => (
            <motion.li
              key={i}
              variants={itemVariants}
              className="flex items-start gap-3 text-sm"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              <span
                className="font-semibold tabular-nums shrink-0 w-4"
                style={{ color: 'oklch(0.40 0.12 145)' }}
              >
                {i + 1}
              </span>
              {step}
            </motion.li>
          ))}
        </motion.ol>
      </motion.div>

      {/* Footer */}
      <motion.div
        variants={itemVariants}
        className="mt-6 pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ borderTop: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-secondary)' }}>
          Questions? Reply to your confirmation email — it goes directly to {data.workspace.name}.
        </p>
        <div className="flex items-center gap-4 shrink-0">
          {signedPdfHref && (
            <a
              href={signedPdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full h-9 px-4 font-medium text-sm tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]"
              style={{
                border: 'var(--portal-border-width) solid var(--portal-border)',
                backgroundColor: 'var(--portal-surface)',
                color: 'var(--portal-text-secondary)',
              }}
            >
              <Download className="w-4 h-4" />
              Download signed copy
            </a>
          )}
          <button
            type="button"
            onClick={onDone}
            className="text-xs transition-colors"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export interface PublicProposalViewProps {
  data: PublicProposalDTO;
  token: string;
  className?: string;
}

export function PublicProposalView({ data, token, className }: PublicProposalViewProps) {
  const router = useRouter();
  const [signOpen, setSignOpen] = useState(false);
  const [signed, setSigned] = useState(data.proposal.status === 'accepted');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const [selections, setSelections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(data.items.map((i) => [i.id, i.clientSelected]))
  );
  const [liveTotal, setLiveTotal] = useState(data.total);
  const [selectionsDirty, setSelectionsDirty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recomputeTotal = useCallback((sels: Record<string, boolean>) => {
    return data.items.reduce((sum, item) => {
      if (!sels[item.id]) return sum;
      const price = Number((item as { override_price?: number | null }).override_price ?? item.unit_price ?? 0);
      const mult = Number((item as { unit_multiplier?: number | null }).unit_multiplier ?? 1) || 1;
      return sum + (item.quantity ?? 1) * mult * price;
    }, 0);
  }, [data.items]);

  const handleSelectionChange = useCallback((itemId: string, selected: boolean) => {
    setSelections((prev) => {
      const next = { ...prev, [itemId]: selected };
      setLiveTotal(recomputeTotal(next));
      setSelectionsDirty(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const selArray = Object.entries(next).map(([id, sel]) => ({ itemId: id, selected: sel }));
        saveClientSelections(token, selArray).catch(() => {});
      }, 800);
      return next;
    });
  }, [recomputeTotal, token]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // IntersectionObserver to track active TOC section
  useEffect(() => {
    const sectionIds = data.items
      .map((i) => (i as { display_group_name?: string | null }).display_group_name ?? 'Included')
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .map((label) => `section-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`);

    if (sectionIds.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [data.items]);

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

  const handleDocuSealComplete = useCallback(() => {
    setSigned(true);
    setTimeout(() => router.refresh(), 4000);
  }, [router]);

  const signedPdfHref = data.signedPdfDownloadUrl ?? null;

  const itemsWithSelections = data.items.map((item) => ({
    ...item,
    clientSelected: selections[item.id] ?? item.clientSelected,
  }));

  const hasOptionalItems = data.items.some((i) => i.isOptional);
  const selectionsConfirmed = !hasOptionalItems || selectionsDirty;

  const hasGroups = data.items.some((i) => (i as { display_group_name?: string | null }).display_group_name);
  const sections = hasGroups
    ? [...new Set(data.items.map((i) => (i as { display_group_name?: string | null }).display_group_name ?? 'Included'))]
        .map((label) => ({ id: `section-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`, label }))
    : [];

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
      <TrackView token={token} />
      <ProposalTOC
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <ProposalHero data={data} className="mb-8 sm:mb-10" />

      {!signed && (
        <ProposalSummaryBlock
          eventTitle={data.event.title}
          startsAt={data.event.startsAt}
          endsAt={data.event.endsAt}
          hasEventTimes={data.event.hasEventTimes}
          venue={data.venue}
          total={liveTotal}
          depositPercent={(data.proposal as { deposit_percent?: number | null }).deposit_percent}
          paymentDueDays={(data.proposal as { payment_due_days?: number | null }).payment_due_days}
          paymentNotes={(data.proposal as { payment_notes?: string | null }).payment_notes}
          scopeNotes={(data.proposal as { scope_notes?: string | null }).scope_notes}
          className="mb-8"
        />
      )}

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.08 }}
        className="flex-1"
      >
        <h2
          className="mb-4"
          style={{
            color: 'var(--portal-text-secondary)',
            fontSize: 'var(--portal-label-size)',
            fontWeight: 'var(--portal-label-weight)',
            letterSpacing: 'var(--portal-label-tracking)',
            textTransform: 'var(--portal-label-transform)' as React.CSSProperties['textTransform'],
          }}
        >
          Scope
        </h2>
        <LineItemGrid
          items={itemsWithSelections}
          className=""
          style={{ gap: 'var(--portal-gap)' } as React.CSSProperties}
          onSelectionChange={!signed ? handleSelectionChange : undefined}
          disabled={signed}
        />
      </motion.section>

      {signed ? (
        <>
          <SignedConfirmation
            data={data}
            signedPdfHref={signedPdfHref}
            onDone={handleDone}
          />
          {(() => {
            const depositPercent = (data.proposal as { deposit_percent?: number | null }).deposit_percent;
            const depositPaidAt = (data.proposal as { deposit_paid_at?: string | null }).deposit_paid_at;
            const serverConfirmedSigned = data.proposal.status === 'accepted';
            const showDepositStep = serverConfirmedSigned && depositPercent && depositPercent > 0 && !depositPaidAt;
            return showDepositStep ? (
              <DepositPaymentStep
                token={token}
                total={liveTotal}
                depositPercent={depositPercent}
              />
            ) : null;
          })()}
        </>
      ) : data.embedSrc ? (
        <div className="mt-6">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            Sign your proposal
          </h2>
          <DocuSealSignPanel embedSrc={data.embedSrc} onComplete={handleDocuSealComplete} />
        </div>
      ) : (
        <AcceptanceBar
          total={liveTotal}
          onReviewAndSign={openSign}
          className="mt-8"
          blockedMessage={!selectionsConfirmed ? 'Review your selections before signing' : undefined}
        />
      )}

      {!data.embedSrc && (
        <SignProposalDialog
          open={signOpen}
          onClose={closeSign}
          token={token}
          onSuccess={onSignSuccess}
        />
      )}

      {/* Attribution */}
      <p
        className="text-center text-[12px] mt-12 pb-4 tracking-[0.08em] uppercase"
        style={{ color: 'var(--portal-text-secondary)', opacity: 0.5 }}
      >
        Powered by Unusonic
      </p>
    </div>
  );
}
