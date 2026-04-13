'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  DollarSign,
  MapPin,
  Navigation,
  Phone,
  UserCircle,
  CalendarDays,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { respondToCrewAssignment } from '@/features/ops/actions/respond-to-crew-assignment';
import { format } from 'date-fns';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface OverviewTabProps {
  role: string;
  status: string;
  payDisplay: string | null;
  payRate: number | null;
  payRateType: string | null;
  scheduledHours: number | null;
  clientInfo: {
    clientName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    guestCount: number | null;
  } | null;
  eventDate: string | null;
  eventArchetype: string | null;
  venueName: string | null;
  venueAddress: string | null;
  mapsUrl: string | null;
  assignmentId: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof DollarSign;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-[var(--stage-text-secondary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        {label}
      </h3>
    </div>
  );
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  return format(new Date(iso), 'EEEE, MMMM d, yyyy');
}

/* ── Confirm / Decline ───────────────────────────────────────────── */

function GigConfirmDecline({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [responded, setResponded] = useState<'confirmed' | 'declined' | null>(
    null,
  );

  const handle = (response: 'confirmed' | 'declined') => {
    startTransition(async () => {
      const result = await respondToCrewAssignment(assignmentId, response);
      if (result.ok) {
        setResponded(response);
        router.refresh();
      }
    });
  };

  if (responded) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 rounded-xl border border-[oklch(0.75_0.15_145/0.2)] bg-[oklch(0.75_0.15_145/0.05)]">
        <Check className="size-4 text-[oklch(0.75_0.15_145)]" />
        <span className="text-sm font-medium text-[oklch(0.75_0.15_145)]">
          {responded === 'confirmed' ? 'Confirmed' : 'Declined'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
      <p className="text-sm text-[var(--stage-text-secondary)]">
        You have been requested for this show. Review the details and respond.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handle('confirmed')}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors duration-[80ms] disabled:opacity-[0.45]"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Confirm
        </button>
        <button
          onClick={() => handle('declined')}
          disabled={isPending}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors duration-[80ms] disabled:opacity-[0.45]"
        >
          <X className="size-4" />
          Decline
        </button>
      </div>
    </div>
  );
}

/* ── Overview Tab ────────────────────────────────────────────────── */

export function OverviewTab({
  role,
  status,
  payDisplay,
  payRate,
  payRateType,
  scheduledHours,
  clientInfo,
  eventDate,
  eventArchetype,
  venueName,
  venueAddress,
  mapsUrl,
  assignmentId,
}: OverviewTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col gap-5"
    >
      {/* Confirm/decline banner */}
      {status === 'requested' && (
        <GigConfirmDecline assignmentId={assignmentId} />
      )}

      {/* Role + Pay card */}
      <div
        className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
        data-surface="surface"
      >
        <SectionHeader icon={DollarSign} label="Role and pay" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-[var(--stage-text-primary)]">
            {role}
          </span>
          {payDisplay ? (
            <span className="text-lg font-semibold tabular-nums text-[var(--stage-text-primary)]">
              {payDisplay}
            </span>
          ) : (
            <span className="text-sm text-[var(--stage-text-secondary)]">
              Rate not set — contact your manager
            </span>
          )}
        </div>
        {payRate != null && (
          <div className="flex items-center gap-4 text-xs text-[var(--stage-text-secondary)]">
            {payRateType && (
              <span className="tabular-nums">
                ${payRate.toFixed(0)}{' '}
                {payRateType === 'hourly' ? '/ hr' : payRateType === 'day' ? '/ day' : `/ ${payRateType}`}
              </span>
            )}
            {scheduledHours != null && scheduledHours > 0 && (
              <span className="tabular-nums">
                {scheduledHours} hr{scheduledHours !== 1 ? 's' : ''} scheduled
              </span>
            )}
          </div>
        )}
      </div>

      {/* Client info card */}
      {clientInfo &&
        (clientInfo.clientName || clientInfo.contactName) && (
          <div
            className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={UserCircle} label="Client" />
            {clientInfo.clientName && (
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                {clientInfo.clientName}
              </p>
            )}
            {clientInfo.contactName && (
              <p className="text-sm text-[var(--stage-text-secondary)]">
                {clientInfo.contactName}
              </p>
            )}
            {clientInfo.contactPhone && (
              <a
                href={`tel:${clientInfo.contactPhone}`}
                className="flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] w-fit"
              >
                <Phone className="size-3.5" />
                {clientInfo.contactPhone}
              </a>
            )}
            {clientInfo.contactEmail && (
              <a
                href={`mailto:${clientInfo.contactEmail}`}
                className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] w-fit"
              >
                {clientInfo.contactEmail}
              </a>
            )}
            {clientInfo.guestCount != null && clientInfo.guestCount > 0 && (
              <p className="text-xs tabular-nums text-[var(--stage-text-secondary)]">
                {clientInfo.guestCount} guests expected
              </p>
            )}
          </div>
        )}

      {/* Event summary card */}
      <div
        className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
        data-surface="elevated"
      >
        <SectionHeader icon={CalendarDays} label="Show" />
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--stage-text-primary)]">
            {formatEventDate(eventDate)}
          </p>
          {eventArchetype && (
            <p className="text-sm text-[var(--stage-text-secondary)]">
              {eventArchetype}
            </p>
          )}
          {venueName && (
            <div className="flex items-center gap-2 pt-1">
              <MapPin className="size-3.5 shrink-0 text-[var(--stage-text-secondary)]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--stage-text-primary)]">
                  {venueName}
                </span>
                {venueAddress && (
                  <span className="text-xs text-[var(--stage-text-secondary)]">
                    {venueAddress}
                  </span>
                )}
              </div>
            </div>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--stage-text-primary)] hover:opacity-80 transition-opacity duration-[80ms] w-fit ml-5.5"
            >
              <Navigation className="size-3.5" />
              Get directions
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
