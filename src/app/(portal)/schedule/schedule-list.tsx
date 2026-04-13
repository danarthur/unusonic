'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { CalendarDays, MapPin, Clock, DollarSign, ChevronRight, Check, X, Loader2, Hand, Send } from 'lucide-react';
import type { CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import type { OpenPosition } from '@/features/ops/actions/get-open-positions';
import type { DealHold } from '@/features/ops/actions/get-entity-deal-holds';
import type { ConfirmedDealGig } from '@/features/ops/actions/get-entity-confirmed-deals';
import { respondToCrewAssignment } from '@/features/ops/actions/respond-to-crew-assignment';
import { respondToDealCrewHold } from '@/features/ops/actions/respond-to-deal-crew-hold';
import { claimPosition } from '@/features/ops/actions/claim-position';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Helpers ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    requested: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
    confirmed: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
    dispatched: 'bg-[oklch(0.85_0.02_0/0.15)] text-[var(--stage-text-secondary)]',
  };
  const icons: Record<string, typeof Clock> = {
    requested: Clock,
    confirmed: Check,
    dispatched: Send,
  };
  const Icon = icons[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}>
      {Icon && <Icon className="size-3" />}
      {status}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return format(new Date(iso), 'EEE, MMM d');
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return format(new Date(iso), 'h:mm a');
}

function formatRate(rate: number | null, type: string | null, hours: number | null): string | null {
  if (!rate) return null;
  if (type === 'hourly' && hours) return `$${(rate * hours).toFixed(0)}`;
  return `$${Number(rate).toFixed(0)}`;
}

function getCountdown(iso: string | null): string {
  if (!iso) return '';
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return formatDate(iso);
}

function mapsUrl(entry: CrewScheduleEntry): string | null {
  const address = entry.venue_address || entry.location_address;
  if (!address) return null;
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

/* ── Confirm / Decline Buttons ────────────────────────────────────── */

function ConfirmDeclineButtons({ assignmentId, variant = 'full' }: { assignmentId: string; variant?: 'full' | 'compact' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [responded, setResponded] = useState<'confirmed' | 'declined' | null>(null);

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
      <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
        {responded === 'confirmed' ? 'Confirmed' : 'Declined'}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => handle('confirmed')}
          disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-[0.45]"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Confirm
        </button>
        <button
          onClick={() => handle('declined')}
          disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => handle('confirmed')}
        disabled={isPending}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-[0.45]"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Confirm
      </button>
      <button
        onClick={() => handle('declined')}
        disabled={isPending}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
      >
        <X className="size-4" />
        Decline
      </button>
    </div>
  );
}

/* ── Hero Card (next gig) ────────────────────────────────────────── */

function NextGigHero({ entry }: { entry: CrewScheduleEntry }) {
  const router = useRouter();
  const maps = mapsUrl(entry);
  const rate = formatRate(entry.pay_rate, entry.pay_rate_type, entry.scheduled_hours);
  const countdown = getCountdown(entry.starts_at);

  return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
        onClick={() => router.push(`/schedule/${entry.assignment_id}`)}
        className="relative flex flex-col gap-4 p-5 rounded-2xl border border-[oklch(1_0_0/0.1)] bg-[var(--stage-surface-elevated)] overflow-hidden cursor-pointer"
      >
        {/* Countdown pill */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Next show
          </span>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]">
            {countdown}
          </span>
        </div>

        {/* Title + Status */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)] leading-snug">
            {entry.event_title ?? 'Untitled show'}
          </h2>
          <StatusBadge status={entry.status} />
        </div>

        {/* Role + Rate */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--stage-text-secondary)]">
            {entry.role}
          </span>
          {rate && (
            <>
              <span className="text-[var(--stage-text-tertiary)]">·</span>
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--stage-text-primary)]">
                <DollarSign className="size-3.5" />
                {rate}
              </span>
            </>
          )}
        </div>

        {/* Call time + Venue */}
        <div className="flex flex-col gap-2">
          {entry.starts_at && (
            <div className="flex items-center gap-2 text-sm text-[var(--stage-text-secondary)]">
              <Clock className="size-4 shrink-0 text-[var(--stage-text-tertiary)]" />
              <span>
                {formatDate(entry.starts_at)} at {formatTime(entry.starts_at)}
                {entry.ends_at ? ` — ${formatTime(entry.ends_at)}` : ''}
              </span>
            </div>
          )}
          {entry.venue_name && (
            <div className="flex items-center gap-2 text-sm text-[var(--stage-text-secondary)]">
              <MapPin className="size-4 shrink-0 text-[var(--stage-text-tertiary)]" />
              {maps ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="underline underline-offset-2 decoration-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors"
                >
                  {entry.venue_name}
                </a>
              ) : (
                <span>{entry.venue_name}</span>
              )}
            </div>
          )}
        </div>

        {/* Confirm / Decline for requested gigs */}
        {entry.status === 'requested' && (
          <ConfirmDeclineButtons assignmentId={entry.assignment_id} />
        )}

        {/* Tap affordance */}
        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-[var(--stage-text-tertiary)] opacity-40" />
      </motion.div>
  );
}

/* ── Compact Card (remaining gigs) ───────────────────────────────── */

function ScheduleCard({ entry, index, readiness }: { entry: CrewScheduleEntry; index: number; readiness?: PrepReadiness }) {
  const router = useRouter();
  const maps = mapsUrl(entry);
  const rate = formatRate(entry.pay_rate, entry.pay_rate_type, entry.scheduled_hours);

  return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...STAGE_MEDIUM, delay: 0 }}
        onClick={() => router.push(`/schedule/${entry.assignment_id}`)}
        className="flex items-center gap-3 p-3.5 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)] group cursor-pointer"
      >
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-12 shrink-0">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            {entry.starts_at ? format(new Date(entry.starts_at), 'MMM') : ''}
          </span>
          <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
            {entry.starts_at ? format(new Date(entry.starts_at), 'd') : '?'}
          </span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
              {entry.event_title ?? 'Untitled show'}
            </h3>
            <StatusBadge status={entry.status} />
            {readiness && readiness.status !== 'complete' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                readiness.status === 'not_started'
                  ? 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)]'
                  : 'bg-[oklch(0.75_0.15_55/0.15)] text-[oklch(0.75_0.15_55)]'
              }`}>
                {readiness.hint}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--stage-text-secondary)]">
            <span>{entry.role}</span>
            {entry.starts_at && (
              <>
                <span>·</span>
                <span>{formatTime(entry.starts_at)}</span>
              </>
            )}
            {entry.venue_name && (
              <>
                <span>·</span>
                {maps ? (
                  <a
                    href={maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="underline underline-offset-2 hover:text-[var(--stage-text-secondary)] transition-colors"
                  >
                    {entry.venue_name}
                  </a>
                ) : (
                  <span>{entry.venue_name}</span>
                )}
              </>
            )}
            {rate && (
              <>
                <span>·</span>
                <span className="text-[var(--stage-text-secondary)]">${rate}</span>
              </>
            )}
          </div>
        </div>

        {entry.status === 'requested' ? (
          <ConfirmDeclineButtons assignmentId={entry.assignment_id} variant="compact" />
        ) : (
          <ChevronRight className="size-4 text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
        )}
      </motion.div>
  );
}

/* ── Hold Card ──────────────────────────────────────────────────── */

const ARCHETYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  corporate: 'Corporate',
  concert: 'Concert',
  festival: 'Festival',
  private: 'Private show',
  conference: 'Conference',
  other: 'Show',
};

function HoldCard({ hold, personEntityId, index }: { hold: DealHold; personEntityId: string; index: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Derive from props (server data) + optimistic local override
  const [optimistic, setOptimistic] = useState<'available' | 'unavailable' | null>(null);
  const responded = optimistic ?? (hold.acknowledgedAt ? 'available' : null);

  const handleRespond = (response: 'available' | 'unavailable') => {
    setOptimistic(response); // Instant UI update
    startTransition(async () => {
      const result = await respondToDealCrewHold(hold.holdId, personEntityId, response);
      if (!result.success) setOptimistic(null); // Revert on failure
      router.refresh();
    });
  };

  if (responded === 'unavailable') return null;

  const archetype = hold.eventArchetype
    ? ARCHETYPE_LABELS[hold.eventArchetype] ?? hold.eventArchetype
    : 'Show';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...STAGE_MEDIUM, delay: 0 }}
      className="rounded-xl border border-[oklch(0.75_0.15_55/0.2)] bg-[oklch(0.75_0.15_55/0.04)] overflow-hidden"
    >
      {/* Tappable info area */}
      <div
        onClick={() => router.push(`/schedule/hold/${hold.holdId}`)}
        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-[oklch(0.75_0.15_55/0.08)] transition-colors"
      >
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-12 shrink-0">
          {hold.proposedDate ? (
            <>
              <span className="stage-label text-[var(--stage-text-tertiary)]">
                {format(new Date(hold.proposedDate + 'T12:00:00'), 'MMM')}
              </span>
              <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
                {format(new Date(hold.proposedDate + 'T12:00:00'), 'd')}
              </span>
            </>
          ) : (
            <span className="text-sm text-[var(--stage-text-tertiary)]">TBD</span>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
              {archetype}
              {hold.proposedDate && (
                <span className="text-[var(--stage-text-secondary)] font-normal">
                  {' · '}{format(new Date(hold.proposedDate + 'T12:00:00'), 'MMM d')}
                </span>
              )}
            </h3>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]">
              hold
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--stage-text-secondary)]">
            {hold.role && <span>{hold.role}</span>}
            <span>Tap for details</span>
            {responded === 'available' && (
              <span className="flex items-center gap-1 text-[oklch(0.75_0.15_145)]">
                <Check className="size-3" />
                Acknowledged
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="size-4 text-[var(--stage-text-tertiary)] shrink-0 opacity-40" />
      </div>

      {/* Response buttons — separate row below */}
      {!responded && (
        <div className="flex items-center gap-2 px-3.5 pb-3 pt-0">
          <button
            onClick={() => handleRespond('available')}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.15)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.25)] transition-colors disabled:opacity-[0.45]"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Available
          </button>
          <button
            onClick={() => handleRespond('unavailable')}
            disabled={isPending}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
          >
            <X className="size-3.5" />
            Unavailable
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Open Position Card ─────────────────────────────────────────── */

function OpenPositionCard({ position, personEntityId, index }: { position: OpenPosition; personEntityId: string; index: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rate = formatRate(position.payRate, position.payRateType, position.scheduledHours);

  const handleClaim = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimPosition(position.assignmentId, personEntityId);
      if (result.success) {
        setClaimed(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  if (claimed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...STAGE_MEDIUM, delay: 0 }}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-[oklch(1_0_0/0.1)] bg-[var(--stage-surface-elevated)]"
    >
      {/* Date block */}
      <div className="flex flex-col items-center justify-center w-12 shrink-0">
        <span className="stage-label text-[var(--stage-text-tertiary)]">
          {position.startsAt ? format(new Date(position.startsAt), 'MMM') : ''}
        </span>
        <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
          {position.startsAt ? format(new Date(position.startsAt), 'd') : '?'}
        </span>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {position.eventTitle ?? 'Untitled show'}
          </h3>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)]">
            open
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--stage-text-tertiary)]">
          <span>{position.role}</span>
          {position.startsAt && (
            <>
              <span>·</span>
              <span>{formatTime(position.startsAt)}</span>
            </>
          )}
          {position.venueName && (
            <>
              <span>·</span>
              <span>{position.venueName}</span>
            </>
          )}
          {rate && (
            <>
              <span>·</span>
              <span className="text-[var(--stage-text-secondary)]">${rate}</span>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-[var(--color-unusonic-error)] mt-1">{error}</p>}
      </div>

      {/* Claim button */}
      <button
        onClick={handleClaim}
        disabled={isPending}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[oklch(0.88_0_0)] text-[oklch(0.13_0_0)] hover:bg-[oklch(0.92_0_0)] transition-colors disabled:opacity-[0.45]"
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />}
        Claim
      </button>
    </motion.div>
  );
}

/* ── Confirmed Deal Card (booked but no event yet) ─────────────── */

function ConfirmedDealCard({ deal, index }: { deal: ConfirmedDealGig; index: number }) {
  const router = useRouter();
  // If there's a crew_assignment, go to the full gig detail page; otherwise hold detail
  const href = deal.assignmentId
    ? `/schedule/${deal.assignmentId}`
    : `/schedule/hold/${deal.dealCrewId}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...STAGE_MEDIUM, delay: 0 }}
      onClick={() => router.push(href)}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-[oklch(0.75_0.15_145/0.15)] bg-[oklch(0.75_0.15_145/0.04)] cursor-pointer hover:bg-[oklch(0.75_0.15_145/0.08)] transition-colors"
    >
      {/* Date block */}
      <div className="flex flex-col items-center justify-center w-12 shrink-0">
        {deal.proposedDate ? (
          <>
            <span className="stage-label text-[var(--stage-text-tertiary)]">
              {format(new Date(deal.proposedDate + 'T12:00:00'), 'MMM')}
            </span>
            <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
              {format(new Date(deal.proposedDate + 'T12:00:00'), 'd')}
            </span>
          </>
        ) : (
          <span className="text-sm text-[var(--stage-text-tertiary)]">TBD</span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {deal.dealTitle ?? deal.eventArchetype ?? 'Show'}
          </h3>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(0.75_0.15_145/0.15)] text-[oklch(0.75_0.15_145)]">
            booked
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--stage-text-secondary)]">
          {deal.role && <span>{deal.role}</span>}
          {deal.venueName && (
            <>
              <span className="text-[var(--stage-text-tertiary)]">·</span>
              <span>{deal.venueName}</span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="size-4 text-[var(--stage-text-tertiary)] shrink-0 opacity-40" />
    </motion.div>
  );
}

/* ── Schedule List ───────────────────────────────────────────────── */

type PrepReadiness = {
  status: 'complete' | 'needs_attention' | 'not_started';
  hint: string | null;
};

interface ScheduleListProps {
  upcoming: CrewScheduleEntry[];
  past: CrewScheduleEntry[];
  openPositions?: OpenPosition[];
  dealHolds?: DealHold[];
  confirmedDeals?: ConfirmedDealGig[];
  personEntityId?: string;
  prepReadiness?: Record<string, PrepReadiness>;
}

export function ScheduleList({ upcoming, past, openPositions = [], dealHolds = [], confirmedDeals = [], personEntityId, prepReadiness }: ScheduleListProps) {
  const hasContent = upcoming.length > 0 || past.length > 0 || confirmedDeals.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <CalendarDays className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No shows yet. When your team books you, it will appear here.
        </p>
        <div className="flex flex-col gap-2 text-xs text-[var(--stage-text-tertiary)]">
          <a href="/my-calendar" className="underline underline-offset-2 hover:text-[var(--stage-text-secondary)] transition-colors">
            Mark your availability on the calendar
          </a>
          <a href="/profile" className="underline underline-offset-2 hover:text-[var(--stage-text-secondary)] transition-colors">
            Update your skills and contact info
          </a>
        </div>
      </div>
    );
  }

  const [nextGig, ...restUpcoming] = upcoming;

  return (
    <div className="flex flex-col gap-8">
      {/* Next gig hero */}
      {nextGig && <NextGigHero entry={nextGig} />}

      {/* Remaining upcoming */}
      {restUpcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Coming up
          </h2>
          {restUpcoming.map((entry, i) => (
            <ScheduleCard key={entry.assignment_id} entry={entry} index={i} readiness={prepReadiness?.[entry.event_id]} />
          ))}
        </section>
      )}

      {/* Booked shows (confirmed on deal but no event/crew_assignment yet) */}
      {confirmedDeals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Booked shows
          </h2>
          {confirmedDeals.map((deal, i) => (
            <ConfirmedDealCard key={deal.dealCrewId} deal={deal} index={i} />
          ))}
        </section>
      )}

      {/* Pending holds */}
      {dealHolds.length > 0 && personEntityId && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Pending holds
          </h2>
          {dealHolds.map((hold, i) => (
            <HoldCard key={hold.holdId} hold={hold} personEntityId={personEntityId} index={i} />
          ))}
        </section>
      )}

      {/* ── Secondary sections (dimmed, separated) ──────────────── */}
      {(past.length > 0 || (openPositions.length > 0 && personEntityId)) && (
        <div className="border-t border-[oklch(1_0_0/0.04)] pt-6 flex flex-col gap-8">
          {/* Recent shows */}
          {past.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                Recent shows
              </h2>
              {past.map((entry, i) => (
                <ScheduleCard key={entry.assignment_id} entry={entry} index={i + restUpcoming.length} readiness={prepReadiness?.[entry.event_id]} />
              ))}
            </section>
          )}

          {/* Open positions (shift pool) */}
          {openPositions.length > 0 && personEntityId && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                Open positions
              </h2>
              <p className="text-xs text-[var(--stage-text-tertiary)] -mt-1">
                Claim a position to request assignment. Your manager will confirm.
              </p>
          {openPositions.map((pos, i) => (
            <OpenPositionCard key={pos.assignmentId} position={pos} personEntityId={personEntityId} index={i} />
          ))}
        </section>
          )}
        </div>
      )}
    </div>
  );
}
