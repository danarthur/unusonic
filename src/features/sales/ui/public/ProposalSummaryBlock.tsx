'use client';

import { motion } from 'framer-motion';
import { CalendarDays, DollarSign, FileText, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface ProposalSummaryBlockProps {
  /** Deal / event title. */
  eventTitle: string;
  /** ISO date string for the event, or null if not yet confirmed. */
  startsAt: string | null;
  /** Total proposal value (sum of client-visible line items). */
  total: number;
  /** Optional deposit percentage, e.g. 50 for "50% deposit required". */
  depositPercent?: number | null;
  /** Optional days until full payment is due, e.g. 30 for "Net 30". */
  paymentDueDays?: number | null;
  /** Optional free-text payment notes from the PM. */
  paymentNotes?: string | null;
  className?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function resolvePaymentTermsLine(
  depositPercent: number | null | undefined,
  paymentDueDays: number | null | undefined,
  paymentNotes: string | null | undefined,
  total: number
): string | null {
  if (paymentNotes?.trim()) return paymentNotes.trim();
  const parts: string[] = [];
  if (depositPercent && depositPercent > 0) {
    const depositAmount = formatCurrency((total * depositPercent) / 100);
    parts.push(`${depositPercent}% deposit (${depositAmount}) due to confirm`);
  }
  if (paymentDueDays && paymentDueDays > 0) {
    parts.push(`balance due Net ${paymentDueDays}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function ProposalSummaryBlock({
  eventTitle,
  startsAt,
  total,
  depositPercent,
  paymentDueDays,
  paymentNotes,
  className,
}: ProposalSummaryBlockProps) {
  const paymentLine = resolvePaymentTermsLine(depositPercent, paymentDueDays, paymentNotes, total);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.12 }}
      className={cn(
        'rounded-2xl border border-[var(--glass-border)]',
        'bg-[var(--glass-bg)] backdrop-blur-xl',
        'p-5 sm:p-6',
        className
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Event */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl p-2 bg-[var(--surface-100)] text-ink-muted shrink-0">
            <FileText className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted mb-0.5">
              Scope
            </p>
            <p className="text-sm font-medium text-ink leading-snug">{eventTitle}</p>
          </div>
        </div>

        {/* Date */}
        {startsAt && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl p-2 bg-[var(--surface-100)] text-ink-muted shrink-0">
              <CalendarDays className="size-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted mb-0.5">
                Event date
              </p>
              <p className="text-sm font-medium text-ink leading-snug">{formatDate(startsAt)}</p>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl p-2 bg-[var(--surface-100)] text-ink-muted shrink-0">
            <DollarSign className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted mb-0.5">
              Total
            </p>
            <p className="text-sm font-medium text-ink leading-snug tabular-nums">
              {formatCurrency(total)}
            </p>
          </div>
        </div>

        {/* Payment terms */}
        {paymentLine && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl p-2 bg-[var(--surface-100)] text-ink-muted shrink-0">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted mb-0.5">
                Payment terms
              </p>
              <p className="text-sm text-ink-muted leading-snug">{paymentLine}</p>
            </div>
          </div>
        )}
      </div>

      {/* Audit trail trust copy */}
      <p className="mt-4 pt-4 border-t border-[var(--glass-border)] text-[11px] text-ink-muted leading-relaxed">
        By signing below you confirm that the scope and pricing above are correct. A timestamped copy of this agreement will be sent to both parties. Electronic signatures are legally binding under the e-SIGN Act and UETA.
      </p>
    </motion.div>
  );
}
