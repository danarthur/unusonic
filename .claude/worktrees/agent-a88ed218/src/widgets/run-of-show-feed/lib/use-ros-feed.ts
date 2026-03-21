'use client';

import { useEffect, useState } from 'react';
import { fetchCues } from '@/app/(dashboard)/(features)/crm/actions/ros';
import { useNextGig } from '@/widgets/live-gig-monitor';

export type CueRow = {
  id: string;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  sort_order: number;
};

/**
 * Fetches run-of-show cues for the next gig in 72h (State B).
 */
export function useRosFeed(): {
  cues: CueRow[];
  loading: boolean;
  eventId: string | null;
} {
  const { gig } = useNextGig();
  const [cues, setCues] = useState<CueRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gig?.id) {
      setCues([]);
      return;
    }
    setLoading(true);
    fetchCues(gig.id)
      .then((data) => setCues((data ?? []) as CueRow[]))
      .catch(() => setCues([]))
      .finally(() => setLoading(false));
  }, [gig?.id]);

  return { cues, loading, eventId: gig?.id ?? null };
}

/** Whether cue is "now" (we're within start through start + duration). */
export function isCueNow(cue: CueRow): boolean {
  if (!cue.start_time) return false;
  const start = new Date(cue.start_time).getTime();
  const durationMs = (cue.duration_minutes ?? 0) * 60 * 1000;
  const end = start + durationMs;
  const now = Date.now();
  return now >= start && now <= end;
}

/** Whether cue is upcoming (start_time in the future). */
export function isCueUpcoming(cue: CueRow): boolean {
  if (!cue.start_time) return true;
  return new Date(cue.start_time).getTime() > Date.now();
}

/** Whether cue is past (start + duration before now). */
export function isCuePast(cue: CueRow): boolean {
  if (!cue.start_time) return false;
  const start = new Date(cue.start_time).getTime();
  const durationMs = (cue.duration_minutes ?? 0) * 60 * 1000;
  return start + durationMs < Date.now();
}
