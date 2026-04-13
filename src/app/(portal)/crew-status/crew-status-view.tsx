'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, MapPin, Clock, ChevronDown, Phone, Users, UserPlus, Check, Send } from 'lucide-react';
import { STAGE_MEDIUM, STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import type { EventCrewStatus, CrewMember } from '@/features/ops/actions/get-workspace-crew-status';

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return format(new Date(iso), 'EEE, MMM d');
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return format(new Date(iso), 'h:mm a');
}

function formatCallTime(iso: string | null): string {
  if (!iso) return '';
  return format(new Date(iso), 'h:mm a');
}

/* ── Status Badge ────────────────────────────────────────────────── */

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
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}
    >
      {Icon && <Icon className="size-3" />}
      {status}
    </span>
  );
}

/* ── Crew Summary Counts ─────────────────────────────────────────── */

function CrewSummary({ summary }: { summary: EventCrewStatus['summary'] }) {
  const parts: { label: string; count: number; color: string }[] = [];

  if (summary.confirmed > 0) {
    parts.push({ label: 'confirmed', count: summary.confirmed, color: 'oklch(0.75 0.15 145)' });
  }
  if (summary.requested > 0) {
    parts.push({ label: 'requested', count: summary.requested, color: 'oklch(0.75 0.15 55)' });
  }
  if (summary.dispatched > 0) {
    parts.push({ label: 'dispatched', count: summary.dispatched, color: 'var(--stage-text-secondary)' });
  }
  if (summary.open > 0) {
    parts.push({ label: 'open', count: summary.open, color: 'var(--stage-text-tertiary)' });
  }

  if (parts.length === 0) {
    return (
      <span className="text-xs text-[var(--stage-text-tertiary)]">No crew assigned</span>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {parts.map((p) => (
        <span
          key={p.label}
          className="text-xs font-medium"
          style={{ color: p.color }}
        >
          {p.count} {p.label}
        </span>
      ))}
    </div>
  );
}

/* ── Crew Row ────────────────────────────────────────────────────── */

function CrewRow({ member }: { member: CrewMember }) {
  const isOpen = !member.entity_id;

  return (
    <div
      className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${
        isOpen
          ? 'bg-[oklch(1_0_0/0.03)] border border-dashed border-[oklch(1_0_0/0.08)]'
          : ''
      }`}
    >
      {/* Avatar placeholder */}
      <div
        className={`size-8 rounded-full flex items-center justify-center shrink-0 ${
          isOpen
            ? 'bg-[oklch(1_0_0/0.06)]'
            : 'bg-[oklch(1_0_0/0.08)]'
        }`}
      >
        {isOpen ? (
          <UserPlus className="size-3.5 text-[var(--stage-text-tertiary)]" />
        ) : (
          <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
            {(member.assignee_name ?? '?')[0]?.toUpperCase()}
          </span>
        )}
      </div>

      {/* Name + Role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${
              isOpen
                ? 'text-[var(--stage-text-tertiary)] italic'
                : 'text-[var(--stage-text-primary)]'
            }`}
          >
            {isOpen ? 'Open' : (member.assignee_name ?? 'Unknown')}
          </span>
          {!isOpen && <StatusBadge status={member.status} />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {member.role && (
            <span className="text-xs text-[var(--stage-text-tertiary)]">
              {member.role}
            </span>
          )}
          {member.call_time_override && (
            <>
              <span className="text-[var(--stage-text-tertiary)]">·</span>
              <span className="flex items-center gap-1 text-xs text-[var(--stage-text-tertiary)]">
                <Clock className="size-3" />
                {formatCallTime(member.call_time_override)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Phone */}
      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          className="flex items-center gap-1 text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="size-3.5" />
          <span className="hidden sm:inline">{member.phone}</span>
        </a>
      )}
    </div>
  );
}

/* ── Event Card ──────────────────────────────────────────────────── */

function EventCrewCard({ event, index }: { event: EventCrewStatus; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const totalCrew = event.crew.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      data-surface="surface"
      className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] overflow-hidden"
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left cursor-pointer"
      >
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-12 shrink-0 pt-0.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            {event.starts_at
              ? format(new Date(event.starts_at), 'MMM')
              : ''}
          </span>
          <span className="text-lg font-semibold text-[var(--stage-text-primary)] leading-none">
            {event.starts_at ? format(new Date(event.starts_at), 'd') : '?'}
          </span>
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {event.title ?? 'Untitled show'}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--stage-text-tertiary)]">
            {event.starts_at && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatTime(event.starts_at)}
              </span>
            )}
            {event.venue_name && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                <span className="truncate">{event.venue_name}</span>
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <CrewSummary summary={event.summary} />
          </div>
        </div>

        {/* Crew count + expand */}
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <span className="flex items-center gap-1 text-xs text-[var(--stage-text-tertiary)]">
            <Users className="size-3.5" />
            {totalCrew}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={STAGE_MEDIUM}
          >
            <ChevronDown className="size-4 text-[var(--stage-text-tertiary)]" />
          </motion.div>
        </div>
      </button>

      {/* Expanded crew roster */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="border-t border-[oklch(1_0_0/0.06)] px-4 py-3 flex flex-col gap-1">
              {event.crew.length === 0 ? (
                <p className="text-xs text-[var(--stage-text-tertiary)] py-2 text-center">
                  No crew assigned yet
                </p>
              ) : (
                event.crew.map((member) => (
                  <CrewRow key={member.assignment_id} member={member} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main View ───────────────────────────────────────────────────── */

interface CrewStatusViewProps {
  events: EventCrewStatus[];
}

export function CrewStatusView({ events }: CrewStatusViewProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <CalendarDays className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No upcoming shows with crew. When events are created, crew status will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Crew status</h1>
      <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        Upcoming shows
      </h2>
      {events.map((event, i) => (
        <EventCrewCard key={event.event_id} event={event} index={i} />
      ))}
    </div>
  );
}
