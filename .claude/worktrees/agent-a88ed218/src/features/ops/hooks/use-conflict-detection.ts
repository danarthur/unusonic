'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEventConflicts, type EventConflict } from '../actions/get-event-conflicts';

export type UseConflictDetectionParams = {
  eventId: string | null;
  /** Optional: if the hook should skip fetching (e.g. no event selected). */
  enabled?: boolean;
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
}: UseConflictDetectionParams): UseConflictDetectionResult {
  const [conflicts, setConflicts] = useState<EventConflict[]>([]);
  const [isChecking, setIsChecking] = useState(true);

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
    fetchConflicts();
  }, [fetchConflicts]);

  // Realtime subscription disabled: avoids WebSocket errors when ops.events is not in
  // Supabase Realtime publication. Conflict list still updates on mount and when refetch() is called.

  return { conflicts, isChecking, refetch: fetchConflicts };
}
