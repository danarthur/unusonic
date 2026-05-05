'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getEventConflicts, type EventConflict } from '../actions/get-event-conflicts';

export type UseConflictDetectionParams = {
  eventId: string | null;
  /** Optional: if the hook should skip fetching (e.g. no event selected). */
  enabled?: boolean;
  /** Pre-resolved conflicts from a parent bundle (e.g. PlanBundle).
   *  When provided (even an empty array), the hook skips the FIRST mount
   *  fetch and uses these instead. Subsequent eventId changes refetch.
   *  Mutations call refetch() explicitly to refresh. */
  initialConflicts?: EventConflict[];
};

export type UseConflictDetectionResult = {
  conflicts: EventConflict[];
  isChecking: boolean;
  refetch: () => Promise<void>;
};

/**
 * Fetches overlapping-event conflicts for crew/gear and optionally subscribes
 * to ops.events Realtime so conflicts update when another planner books the same resource.
 */
export function useConflictDetection({
  eventId,
  enabled = true,
  initialConflicts,
}: UseConflictDetectionParams): UseConflictDetectionResult {
  const [conflicts, setConflicts] = useState<EventConflict[]>(initialConflicts ?? []);
  const [isChecking, setIsChecking] = useState(initialConflicts === undefined);
  const warmStartedRef = useRef(initialConflicts !== undefined);

  const fetchConflicts = useCallback(async () => {
    if (!eventId || !enabled) {
      setConflicts([]);
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    try {
      const result = await getEventConflicts(eventId);
      setConflicts(result.conflicts ?? []);
    } catch {
      setConflicts([]);
    } finally {
      setIsChecking(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    // Honour the parent-provided conflicts on the FIRST render only. On
    // subsequent eventId changes we want the fetch path to take over so
    // the data reflects the new event's actual conflicts.
    if (warmStartedRef.current) {
      warmStartedRef.current = false;
      return;
    }
    fetchConflicts();
  }, [fetchConflicts]);

  // Realtime subscription disabled: avoids WebSocket errors when ops.events is not in
  // Supabase Realtime publication. Conflict list still updates on mount and when refetch() is called.

  return { conflicts, isChecking, refetch: fetchConflicts };
}
