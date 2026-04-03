'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, MapPin, Clock, DollarSign, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import type { CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import { respondToCrewAssignment } from '@/features/ops/actions/respond-to-crew-assignment';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Helpers ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    requested: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
    confirmed: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
    dispatched: 'bg-[oklch(0.85_0.02_0/0.15)] text-[var(--stage-text-secondary)]',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Confirm
        </button>
        <button
          onClick={() => handle('declined')}
          disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-50"
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
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Confirm
      </button>
      <button
        onClick={() => handle('declined')}
        disabled={isPending}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-50"
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

function ScheduleCard({ entry, index }: { entry: CrewScheduleEntry; index: number }) {
  const router = useRouter();
  const maps = mapsUrl(entry);
  const rate = formatRate(entry.pay_rate, entry.pay_rate_type, entry.scheduled_hours);

  return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...STAGE_MEDIUM, delay: index * 0.03 }}
        onClick={() => router.push(`/schedule/${entry.assignment_id}`)}
        className="flex items-center gap-3 p-3.5 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] group cursor-pointer"
      >
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-12 shrink-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            {entry.starts_at ? new Date(entry.starts_at).toLocaleDateString('en-US', { month: 'short' }) : ''}
          </span>
          <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
            {entry.starts_at ? new Date(entry.starts_at).getDate() : '?'}
          </span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
              {entry.event_title ?? 'Untitled show'}
            </h3>
            <StatusBadge status={entry.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--stage-text-tertiary)]">
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

/* ── Schedule List ───────────────────────────────────────────────── */

interface ScheduleListProps {
  upcoming: CrewScheduleEntry[];
  past: CrewScheduleEntry[];
}

export function ScheduleList({ upcoming, past }: ScheduleListProps) {
  const hasContent = upcoming.length > 0 || past.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <CalendarDays className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No shows yet. When your team books you, it will appear here.
        </p>
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
            <ScheduleCard key={entry.assignment_id} entry={entry} index={i} />
          ))}
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Past
          </h2>
          {past.map((entry, i) => (
            <ScheduleCard key={entry.assignment_id} entry={entry} index={i + restUpcoming.length} />
          ))}
        </section>
      )}
    </div>
  );
}
