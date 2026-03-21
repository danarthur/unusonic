'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

export type NextGig = {
  id: string;
  title: string | null;
  starts_at: string;
  location_name: string | null;
  lifecycle_status: string | null;
};

/**
 * Next upcoming gig in the next 72h (confirmed, production, or live) for State B hero.
 */
export function useNextGig(): { gig: NextGig | null; loading: boolean; error: string | null } {
  const { workspaceId } = useWorkspace();
  const supabase = useMemo(() => createClient(), []);
  const [gig, setGig] = useState<NextGig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const now = new Date().toISOString();
    const in72h = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('events')
      .select('id, title, starts_at, location_name, lifecycle_status')
      .in('lifecycle_status', ['confirmed', 'production', 'live'])
      .gte('starts_at', now)
      .lte('starts_at', in72h)
      .order('starts_at', { ascending: true })
      .limit(1);

    if (workspaceId) query = query.eq('workspace_id', workspaceId);

    void Promise.resolve(query)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError(err.message);
          setGig(null);
          return;
        }
        const row = Array.isArray(data) && data[0] ? (data[0] as NextGig) : null;
        setGig(row);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supabase, workspaceId]);

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
