'use client';

import { useMemo } from 'react';
import { useLobbyEvents } from '@/widgets/global-pulse/lib/use-lobby-events';

export type PipelineStage = 'lead' | 'tentative' | 'confirmed' | 'production' | 'live';

export type PipelineVelocityData = {
  stages: { key: PipelineStage; label: string; count: number }[];
  loading: boolean;
  error: string | null;
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  tentative: 'Tentative',
  confirmed: 'Confirmed',
  production: 'Production',
  live: 'Live',
};

const STAGE_KEYS: PipelineStage[] = ['lead', 'tentative', 'confirmed', 'production', 'live'];

/**
 * Counts events by lifecycle_status for pipeline funnel (State A hero).
 * Derives from the shared lobby events query — no independent fetch.
 */
export function usePipelineVelocity(): PipelineVelocityData {
  const { events, loading, error } = useLobbyEvents();

  const stages = useMemo(() => {
    const counts: Record<PipelineStage, number> = {
      lead: 0, tentative: 0, confirmed: 0, production: 0, live: 0,
    };
    for (const e of events) {
      if (counts[e.lifecycle_status as PipelineStage] !== undefined) {
        counts[e.lifecycle_status as PipelineStage]++;
      }
    }
    return STAGE_KEYS.map((key) => ({ key, label: STAGE_LABELS[key], count: counts[key] }));
  }, [events]);

  return { stages, loading, error };
}
