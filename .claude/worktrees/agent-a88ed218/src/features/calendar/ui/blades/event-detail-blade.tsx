'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, ExternalLink, Mail, FileText, LayoutDashboard } from 'lucide-react';
import { fetchEventDetailsAction } from '@/features/calendar/actions/get-event-details';
import type { EventDetailDTO } from '@/features/calendar/model/event-detail';

const EVENT_PARAM = 'event';
const DRAWER_WIDTH = 400;
const DETAIL_WIDTH = Math.round(DRAWER_WIDTH * 0.95);
const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };

const STATUS_LABELS: Record<EventDetailDTO['status'], string> = {
  confirmed: 'Confirmed',
  hold: 'Hold',
  cancelled: 'Cancelled',
  planned: 'Planned',
};

const COLOR_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-400/30',
  amber: 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-400/30',
  rose: 'bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-400/30',
  blue: 'bg-blue-500/20 text-blue-800 dark:text-blue-200 border-blue-400/30',
};

export interface EventDetailBladeProps {
  eventId: string;
}

export function EventDetailBlade({ eventId }: EventDetailBladeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<EventDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backToList = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(EVENT_PARAM);
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEventDetailsAction(eventId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data ?? null);
          if (data === null && !cancelled) setError('Event not found');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load event');
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const colorClass = detail ? COLOR_CLASSES[detail.color] ?? COLOR_CLASSES.blue : COLOR_CLASSES.blue;

  return (
    <motion.aside
      initial={{ x: DETAIL_WIDTH }}
      animate={{ x: 0 }}
      exit={{ x: DETAIL_WIDTH }}
      transition={springConfig}
      className="fixed top-0 right-0 z-[60] h-screen flex flex-col border-l-2 border-[var(--glass-border)] bg-[var(--glass-bg)]/98 backdrop-blur-2xl shadow-[var(--glass-shadow)] overflow-hidden antialiased"
      style={{ width: DETAIL_WIDTH, maxWidth: '95vw' }}
      role="dialog"
      aria-label="Event details"
    >
      {/* Header: Back to List */}
      <div className="shrink-0 flex items-center gap-3 p-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/50 backdrop-blur-md">
        <motion.button
          type="button"
          onClick={backToList}
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex items-center gap-2 p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Back to list"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to List</span>
        </motion.button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-ink/10 rounded-lg w-3/4" />
            <div className="h-6 bg-ink/10 rounded w-1/2" />
            <div className="h-20 bg-ink/10 rounded-xl" />
          </div>
        )}
        {error && (
          <p className="text-sm text-[var(--color-signal-error)] py-4">{error}</p>
        )}
        {!loading && !error && detail && (
          <div className="space-y-6">
            {/* Hero: Title, Status Badge, Location */}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{detail.title}</h1>
              <div className="mt-3">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colorClass}`}
                >
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>
              {detail.location && (
                <p className="mt-3 text-sm text-ink-muted flex items-center gap-2">
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden />
                  {detail.location}
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/events/${detail.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-silk/80 hover:bg-silk text-ink font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                <LayoutDashboard className="w-4 h-4" />
                Command Center
              </Link>
              <Link
                href={`/events/${detail.id}/deal`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-silk/80 hover:bg-silk text-ink font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <FileText className="w-4 h-4" />
                  Open Deal room
                </Link>
              {detail.projectId && (
                <Link
                  href={`/projects/${detail.projectId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-silk/80 hover:bg-silk text-ink font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Project Workspace
                </Link>
              )}
              {detail.leadContact && (
                <a
                  href={`mailto:${detail.leadContact}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl liquid-panel-hover text-ink-muted hover:text-ink font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <Mail className="w-4 h-4" />
                  Contact Lead
                </a>
              )}
            </div>

            {/* Mini-Dashboard: 3-column */}
            <div className="grid grid-cols-3 gap-4">
              <div className="liquid-panel-nested p-4 rounded-xl">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Crew</p>
                <p className="text-2xl font-semibold text-ink mt-1">{detail.crewCount}</p>
              </div>
              <div className="liquid-panel-nested p-4 rounded-xl">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Guests</p>
                <p className="text-2xl font-semibold text-ink mt-1">{detail.guestCount}</p>
              </div>
              <div className="liquid-panel-nested p-4 rounded-xl">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Timeline</p>
                <p className="text-sm font-medium text-ink mt-1">
                  {detail.timelineStatus ?? '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
