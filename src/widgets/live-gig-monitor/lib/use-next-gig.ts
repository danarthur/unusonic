'use client';

import { useMemo } from 'react';
import { useLobbyEvents } from '@/widgets/global-pulse/lib/use-lobby-events';

export type NextGig = {
  id: string;
  title: string | null;
  starts_at: string;
  location_name: string | null;
  lifecycle_status: string | null;
};

/**
 * Next upcoming gig in the next 72h (confirmed, production, or live) for State B hero.
 * Derives from the shared lobby events query — no independent fetch.
 */
export function useNextGig(): { gig: NextGig | null; loading: boolean; error: string | null } {
  const { events, loading, error } = useLobbyEvents();

  const gig = useMemo<NextGig | null>(() => {
    const now = Date.now();
    const in72h = now + 72 * 60 * 60 * 1000;

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
