'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

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

/**
 * Counts events by lifecycle_status for pipeline funnel (State A hero).
 */
export function usePipelineVelocity(): PipelineVelocityData {
  const { workspaceId } = useWorkspace();
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState<Record<PipelineStage, number>>({
    lead: 0,
    tentative: 0,
    confirmed: 0,
    production: 0,
    live: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    let query = supabase
      .from('events')
      .select('lifecycle_status')
      .in('lifecycle_status', ['lead', 'tentative', 'confirmed', 'production', 'live'])
      .neq('lifecycle_status', 'archived');

    if (workspaceId) query = query.eq('workspace_id', workspaceId);

    void Promise.resolve(query)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError(err.message);
          setCounts({ lead: 0, tentative: 0, confirmed: 0, production: 0, live: 0 });
          return;
        }
        const rows = (data ?? []) as Array<{ lifecycle_status: string }>;
        const next: Record<PipelineStage, number> = {
          lead: 0,
          tentative: 0,
          confirmed: 0,
          production: 0,
          live: 0,
        };
        for (const r of rows) {
          if (r.lifecycle_status && next[r.lifecycle_status as PipelineStage] !== undefined) {
            next[r.lifecycle_status as PipelineStage]++;
          }
        }
        setCounts(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supabase, workspaceId]);

  const stages: PipelineVelocityData['stages'] = (['lead', 'tentative', 'confirmed', 'production', 'live'] as const).map(
    (key) => ({ key, label: STAGE_LABELS[key], count: counts[key] })
  );

  return { stages, loading, error };
}
