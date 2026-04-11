'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

export type LobbyEvent = {
  id: string;
  title: string | null;
  starts_at: string;
  location_name: string | null;
  lifecycle_status: string;
  /** Pass 3 Phase 3: real show-live signal. Non-null means the PM pressed Start Show. */
  show_started_at: string | null;
  /** Pass 3 Phase 3: real show-ended signal. Non-null means the PM pressed End Show. */
  show_ended_at: string | null;
};

/**
 * Module-level cache so the lobby event data survives remounts within the same
 * page session. Resets on full navigation.
 */
let cached: { data: LobbyEvent[]; ts: number } | null = null;
const STALE_MS = 30_000;

/**
 * Single query for all lobby event data. Three widgets previously queried
 * ops.events independently — this consolidates into one fetch.
 *
 * Returns all non-archived events with a recognized lifecycle_status.
 * Individual consumers derive what they need:
 * - Pulse metrics: count events in next 72h
 * - Next gig: first event in next 72h sorted by starts_at
 * - Pipeline velocity: group by lifecycle_status
 */
export function useLobbyEvents() {
  const { workspaceId } = useWorkspace();
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<LobbyEvent[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached || Date.now() - cached.ts > STALE_MS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (cached && Date.now() - cached.ts < STALE_MS) {
      setEvents(cached.data);
      setLoading(false);
      return;
    }

    async function run() {
      try {
        // Pass 3 Phase 4: explicitly exclude archived events. The Lobby is
        // the canonical "active piles" surface — archived shows belong in
        // history, not here. See src/shared/lib/event-status/get-active-events-filter.ts
        // for the allowlist rationale.
        let query = supabase
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, location_name, lifecycle_status, show_started_at, show_ended_at')
          .in('lifecycle_status', ['lead', 'tentative', 'confirmed', 'production', 'live'])
          .is('archived_at', null);

        if (workspaceId) query = query.eq('workspace_id', workspaceId);

        const { data, error: err } = await query;

        if (!active) return;
        if (err) {
          setError(err.message);
          return;
        }

        const rows = (data ?? []) as LobbyEvent[];
        cached = { data: rows, ts: Date.now() };
        setEvents(rows);
      } catch (e) {
        if (active) setError('Unable to load events');
      } finally {
        if (active) setLoading(false);
      }
    }

    run();
    return () => { active = false; };
  }, [supabase, workspaceId]);

  return { events, loading, error };
}
