'use client';

import { motion } from 'framer-motion';
import { CalendarDays, DollarSign, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const spring = STAGE_MEDIUM;

export interface ProposalSummaryBlockProps {
  eventTitle: string;
  startsAt: string | null;
  endsAt?: string | null;
  hasEventTimes?: boolean;
  venue?: { name: string; address: string | null } | null;
  total: number;
  depositPercent?: number | null;
  paymentDueDays?: number | null;
  paymentNotes?: string | null;
  scopeNotes?: string | null;
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

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function resolvePaymentTermsLine(
  depositPercent: number | null | undefined,
  paymentDueDays: number | null | undefined,
  paymentNotes: string | null | undefined,
  total: number,
  startsAt: string | null | undefined
): string | null {
  if (paymentNotes?.trim()) return paymentNotes.trim();
  const parts: string[] = [];
  if (depositPercent && depositPercent > 0) {
    const depositAmount = formatCurrency((total * depositPercent) / 100);
    parts.push(`${depositPercent}% deposit (${depositAmount}) due to confirm`);
  }
  if (paymentDueDays && paymentDueDays > 0) {
    if (startsAt) {
      const eventDate = new Date(startsAt);
      const dueDate = new Date(eventDate);
      dueDate.setDate(dueDate.getDate() - paymentDueDays);
      const dueDateStr = dueDate.toLocaleDateString(undefined, {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      parts.push(`balance due by ${dueDateStr}`);
    } else {
      parts.push(`balance due Net ${paymentDueDays}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function ProposalSummaryBlock({
  eventTitle,
  startsAt,
  endsAt,
  hasEventTimes,
  venue,
  total,
  depositPercent,
  paymentDueDays,
  paymentNotes,
  scopeNotes,
  className,
}: ProposalSummaryBlockProps) {
  const paymentLine = resolvePaymentTermsLine(depositPercent, paymentDueDays, paymentNotes, total, startsAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.12 }}
      className={cn('rounded-[var(--portal-radius)] p-5 sm:p-6', className)}
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Event */}
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 rounded-lg p-2 shrink-0"
            style={{
              backgroundColor: 'var(--portal-accent-subtle)',
              color: 'var(--portal-text-secondary)',
            }}
          >
            <FileText className="size-4" />
          </div>
          <div>
            <p
              className="mb-0.5"
              style={{
                fontSize: 'var(--portal-label-size)',
                fontWeight: 'var(--portal-label-weight)',
                letterSpacing: 'var(--portal-label-tracking)',
                textTransform: 'var(--portal-label-transform)' as unknown as string,
                color: 'var(--portal-text-secondary)',
              }}
            >
              Scope
            </p>
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--portal-text)' }}>
              {eventTitle}
            </p>
          </div>
        </div>

        {/* Date */}
        {startsAt && (
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 rounded-lg p-2 shrink-0"
              style={{
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text-secondary)',
              }}
            >
              <CalendarDays className="size-4" />
            </div>
            <div>
              <p
                className="mb-0.5"
                style={{
                  fontSize: 'var(--portal-label-size)',
                  fontWeight: 'var(--portal-label-weight)',
                  letterSpacing: 'var(--portal-label-tracking)',
                  textTransform: 'var(--portal-label-transform)' as unknown as string,
                  color: 'var(--portal-text-secondary)',
                }}
              >
                Event date
              </p>
              <p className="text-sm font-medium leading-snug" style={{ color: 'var(--portal-text)' }}>
                {formatDate(startsAt)}
              </p>
              {hasEventTimes && (
                <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--portal-text-secondary)' }}>
                  {formatTime(startsAt)}{endsAt ? ` – ${formatTime(endsAt)}` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Venue */}
        {venue && (
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 rounded-lg p-2 shrink-0"
              style={{
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text-secondary)',
              }}
            >
              <MapPin className="size-4" />
            </div>
            <div>
              <p
                className="mb-0.5"
                style={{ color: 'var(--portal-text-secondary)' }}
              >
                Venue
              </p>
              <p className="text-sm font-medium leading-snug" style={{ color: 'var(--portal-text)' }}>
                {venue.name}
              </p>
              {venue.address && (
                <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--portal-text-secondary)' }}>
                  {venue.address}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 rounded-lg p-2 shrink-0"
            style={{
              backgroundColor: 'var(--portal-accent-subtle)',
              color: 'var(--portal-text-secondary)',
            }}
          >
            <DollarSign className="size-4" />
          </div>
          <div>
            <p
              className="mb-0.5"
              style={{
                fontSize: 'var(--portal-label-size)',
                fontWeight: 'var(--portal-label-weight)',
                letterSpacing: 'var(--portal-label-tracking)',
                textTransform: 'var(--portal-label-transform)' as unknown as string,
                color: 'var(--portal-text-secondary)',
              }}
            >
              Total
            </p>
            <p
              className="font-medium leading-snug tabular-nums"
              style={{
                color: 'var(--portal-text)',
                fontSize: 'var(--portal-total-scale, 1rem)',
              }}
            >
              {formatCurrency(total)}
            </p>
          </div>
        </div>

        {/* Payment terms */}
        {paymentLine && (
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 rounded-lg p-2 shrink-0"
              style={{
                backgroundColor: 'var(--portal-accent-subtle)',
                color: 'var(--portal-text-secondary)',
              }}
            >
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <p
                className="mb-0.5"
                style={{
                  fontSize: 'var(--portal-label-size)',
                  fontWeight: 'var(--portal-label-weight)',
                  letterSpacing: 'var(--portal-label-tracking)',
                  textTransform: 'var(--portal-label-transform)' as unknown as string,
                  color: 'var(--portal-text-secondary)',
                }}
              >
                Payment terms
              </p>
              <p className="text-sm leading-snug" style={{ color: 'var(--portal-text-secondary)' }}>
                {paymentLine}
              </p>
            </div>
          </div>
        )}
      </div>

      {scopeNotes?.trim() && (
        <p
          className="mt-4 text-sm leading-relaxed italic pt-4"
          style={{
            color: 'var(--portal-text-secondary)',
            borderTop: 'var(--portal-border-width) solid var(--portal-border-subtle)',
          }}
        >
          {scopeNotes.trim()}
        </p>
      )}

      {/* Audit trail trust copy */}
      <p
        className="mt-4 pt-4 text-field-label leading-relaxed"
        style={{
          color: 'var(--portal-text-secondary)',
          borderTop: 'var(--portal-border-width) solid var(--portal-border-subtle)',
        }}
      >
        By signing below you confirm that the scope and pricing above are correct. A timestamped copy of this agreement will be sent to both parties. Electronic signatures are legally binding under the e-SIGN Act and UETA.
      </p>
    </motion.div>
  );
}
