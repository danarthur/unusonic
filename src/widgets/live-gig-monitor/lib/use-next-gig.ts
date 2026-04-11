'use client';

import { useMemo } from 'react';
import { useLobbyEvents } from '@/widgets/global-pulse/lib/use-lobby-events';

export type NextGig = {
  id: string;
  title: string | null;
  starts_at: string;
  location_name: string | null;
  lifecycle_status: string | null;
  /** Pass 3 Phase 3: real show-live signal. */
  show_started_at: string | null;
  /** Pass 3 Phase 3: real show-ended signal. */
  show_ended_at: string | null;
};

/**
 * Next upcoming gig in the next 72h (confirmed, production, or live) for State B hero.
 * Derives from the shared lobby events query — no independent fetch.
 *
 * Pass 3 Phase 3: a gig that has been explicitly Started (show_started_at set,
 * show_ended_at null) is treated as "live right now" and remains the current
 * gig regardless of whether its starts_at has passed. This is the real-time
 * signal that the Lobby uses to flip into Critical/Focus layout.
 */
export function useNextGig(): { gig: NextGig | null; loading: boolean; error: string | null } {
  const { events, loading, error } = useLobbyEvents();

  const gig = useMemo<NextGig | null>(() => {
    const now = Date.now();
    const in72h = now + 72 * 60 * 60 * 1000;

    // Live now takes precedence over upcoming.
    const liveNow = events.find((e) => !!e.show_started_at && !e.show_ended_at);
    if (liveNow) return liveNow;

    const upcoming = events
      .filter((e) => {
        if (!['confirmed', 'production', 'live'].includes(e.lifecycle_status)) return false;
        const t = new Date(e.starts_at).getTime();
        return t >= now && t <= in72h;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    return upcoming[0] ?? null;
  }, [events]);

  return { gig, loading, error };
}

/** Minutes until a given ISO date. */
export function minutesUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / (60 * 1000)));
}

export function formatCountdown(minutes: number): string {
  if (minutes >= 24 * 60) {
    const d = Math.floor(minutes / (24 * 60));
    const h = Math.floor((minutes % (24 * 60)) / 60);
    return `${d}d ${h}h`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes}m`;
}
