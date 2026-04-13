'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, MapPin, DollarSign, Briefcase, Check, X, Loader2, FileText, UserCircle, Phone } from 'lucide-react';
import { respondToDealCrewHold } from '@/features/ops/actions/respond-to-deal-crew-hold';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { DealHoldDetail } from '@/features/ops/actions/get-deal-hold-detail';

const ARCHETYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  corporate: 'Corporate',
  concert: 'Concert',
  festival: 'Festival',
  private: 'Private show',
  conference: 'Conference',
  other: 'Show',
};

function formatTime12h(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface HoldDetailViewProps {
  hold: DealHoldDetail;
  personEntityId: string;
}

export function HoldDetailView({ hold, personEntityId }: HoldDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<'available' | 'unavailable' | null>(null);
  const isConfirmed = !!hold.confirmedAt;
  const responded = optimistic ?? (hold.acknowledgedAt ? 'available' : hold.declinedAt ? 'unavailable' : null);

  const archetype = hold.eventArchetype
    ? ARCHETYPE_LABELS[hold.eventArchetype] ?? hold.eventArchetype
    : 'Show';

  const handleRespond = (response: 'available' | 'unavailable') => {
    setOptimistic(response);
    startTransition(async () => {
      const result = await respondToDealCrewHold(hold.holdId, personEntityId, response);
      if (!result.success) setOptimistic(null);
      router.refresh();
    });
  };

  const formattedDate = hold.proposedDate
    ? format(new Date(hold.proposedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy')
    : null;

  const timeRange = hold.eventStartTime
    ? `${formatTime12h(hold.eventStartTime)}${hold.eventEndTime ? ` — ${formatTime12h(hold.eventEndTime)}` : ''}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push('/schedule')}
        className="flex items-center gap-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Schedule
      </button>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--stage-text-primary)]">
            {hold.dealTitle ?? archetype}
          </h1>
          {isConfirmed ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[oklch(0.75_0.15_145/0.15)] text-[oklch(0.75_0.15_145)]">
              booked
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]">
              {responded === 'available' ? 'acknowledged' : responded === 'unavailable' ? 'declined' : 'hold'}
            </span>
          )}
        </div>
        {hold.role && (
          <p className="text-sm text-[var(--stage-text-secondary)]">
            Your role: {hold.role}
          </p>
        )}
      </div>

      {/* Details card */}
      <div className="rounded-2xl border border-[oklch(1_0_0/0.08)] bg-[var(--stage-surface-elevated)] p-5 flex flex-col gap-4" data-surface="elevated">
        {/* Event type */}
        {hold.eventArchetype && (
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            {archetype}
          </p>
        )}

        {/* Date */}
        {formattedDate && (
          <div className="flex items-start gap-3">
            <Calendar className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">{formattedDate}</p>
              {timeRange && (
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">{timeRange}</p>
              )}
            </div>
          </div>
        )}

        {/* Call time */}
        {hold.callTime && (
          <div className="flex items-start gap-3">
            <Clock className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-xs text-[var(--stage-text-tertiary)] uppercase tracking-wider">Call time</p>
              <p className="text-sm text-[var(--stage-text-primary)]">{formatTime12h(hold.callTime)}</p>
            </div>
          </div>
        )}

        {/* Venue */}
        {hold.venueName && (
          <div className="flex items-start gap-3">
            <MapPin className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-sm text-[var(--stage-text-primary)]">{hold.venueName}</p>
              {hold.venueCity && (
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">{hold.venueCity}</p>
              )}
            </div>
          </div>
        )}

        {/* Arrival location */}
        {hold.arrivalLocation && (
          <div className="flex items-start gap-3">
            <MapPin className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-xs text-[var(--stage-text-tertiary)] uppercase tracking-wider">Arrival</p>
              <p className="text-sm text-[var(--stage-text-primary)]">{hold.arrivalLocation}</p>
            </div>
          </div>
        )}

        {/* Pay */}
        {hold.dayRate != null && (
          <div className="flex items-start gap-3">
            <DollarSign className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-xs text-[var(--stage-text-tertiary)] uppercase tracking-wider">Day rate</p>
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                ${hold.dayRate.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Notes */}
        {hold.notes && (
          <div className="flex items-start gap-3">
            <FileText className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-tertiary)]" />
            <div>
              <p className="text-xs text-[var(--stage-text-tertiary)] uppercase tracking-wider">Notes</p>
              <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-line mt-0.5">{hold.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Client info (confirmed deals only) */}
      {isConfirmed && (hold.clientName || hold.contactName || hold.dealNotes) && (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface)]">
          <div className="flex items-center gap-2 mb-1">
            <UserCircle className="size-4 text-[var(--stage-text-tertiary)]" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Client</h3>
          </div>
          {hold.clientName && (
            <p className="text-sm font-medium text-[var(--stage-text-primary)]">{hold.clientName}</p>
          )}
          {hold.contactName && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--stage-text-secondary)]">{hold.contactName}</span>
              <div className="flex items-center gap-3 shrink-0">
                {hold.contactPhone && (
                  <a href={`tel:${hold.contactPhone}`} className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors">
                    <Phone className="size-3" />
                    {hold.contactPhone}
                  </a>
                )}
                {hold.contactEmail && (
                  <a href={`mailto:${hold.contactEmail}`} className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors">
                    {hold.contactEmail}
                  </a>
                )}
              </div>
            </div>
          )}
          {hold.dealNotes && (
            <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap border-t border-[oklch(1_0_0/0.04)] pt-3 mt-1">{hold.dealNotes}</p>
          )}
        </div>
      )}

      {/* Response section */}
      {responded === 'available' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[oklch(0.75_0.15_145/0.08)] border border-[oklch(0.75_0.15_145/0.15)]">
          <Check className="size-4 text-[oklch(0.75_0.15_145)]" />
          <p className="text-sm text-[oklch(0.75_0.15_145)]">
            {isConfirmed
              ? 'You are booked for this show. Details will be updated as they become available.'
              : 'You confirmed you are available. Your manager will finalize the booking.'}
          </p>
        </div>
      )}

      {responded === 'unavailable' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[oklch(1_0_0/0.04)] border border-[oklch(1_0_0/0.06)]">
          <X className="size-4 text-[var(--stage-text-tertiary)]" />
          <p className="text-sm text-[var(--stage-text-tertiary)]">
            You declined this hold. Your manager has been notified.
          </p>
        </div>
      )}

      {!responded && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--stage-text-tertiary)]">
            Are you available for this date?
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleRespond('available')}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl bg-[oklch(0.75_0.15_145/0.15)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.25)] transition-colors disabled:opacity-[0.45]"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Available
            </button>
            <button
              onClick={() => handleRespond('unavailable')}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
            >
              <X className="size-4" />
              Unavailable
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
