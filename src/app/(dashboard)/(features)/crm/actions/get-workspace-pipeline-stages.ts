'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { normalizeTriggers, type TriggerEntry } from '@/shared/lib/triggers/normalize';

export type WorkspacePipelineStage = {
  id: string;
  slug: string;
  label: string;
  kind: 'working' | 'won' | 'lost';
  sort_order: number;
  requires_confirmation: boolean;
  opens_handoff_wizard: boolean;
  hide_from_portal: boolean;
  tags: string[];
  color_token: string | null;
  triggers: TriggerEntry[];
};

export type WorkspacePipeline = {
  pipelineId: string;
  pipelineName: string;
  stages: WorkspacePipelineStage[];
};

/**
 * Inner uncached fetch. Takes workspaceId so the cache key derived from it is
 * stable per-workspace (different workspaces have different pipelines).
 */
async function fetchWorkspacePipelineStagesUncached(
  workspaceId: string,
): Promise<WorkspacePipeline | null> {
  const supabase = await createClient();

  const { data: pipeline } = await supabase
    .schema('ops')
    .from('pipelines')
    .select(
      'id, name, pipeline_stages(id, slug, label, kind, sort_order, requires_confirmation, opens_handoff_wizard, hide_from_portal, tags, color_token, triggers, is_archived)',
    )
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .eq('is_archived', false)
    .maybeSingle();

  if (!pipeline) return null;

  type RawStage = {
    id: string;
    slug: string;
    label: string;
    kind: string;
    sort_order: number;
    requires_confirmation: boolean;
    opens_handoff_wizard: boolean;
    hide_from_portal: boolean;
    tags: string[] | null;
    color_token: string | null;
    triggers: unknown;
    is_archived: boolean;
  };

  const raw = (pipeline as { id: string; name: string; pipeline_stages?: RawStage[] | null });
  const stages = (raw.pipeline_stages ?? [])
    .filter((s) => !s.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map<WorkspacePipelineStage>((s) => ({
      id: s.id,
      slug: s.slug,
      label: s.label,
      kind: s.kind as 'working' | 'won' | 'lost',
      sort_order: s.sort_order,
      requires_confirmation: s.requires_confirmation,
      opens_handoff_wizard: s.opens_handoff_wizard,
      hide_from_portal: s.hide_from_portal,
      tags: s.tags ?? [],
      color_token: s.color_token,
      triggers: normalizeTriggers(s.triggers),
    }));

  return {
    pipelineId: raw.id,
    pipelineName: raw.name,
    stages,
  };
}

// Module-level cache. Lives inside the same module — `'use server'` files
// permit non-exported top-level constants. `unstable_cache` was the obvious
// choice but it forbids `cookies()` inside the cached function (Supabase
// client uses cookies for auth), and we can't easily hoist that out. So this
// is a simple Map<workspaceId, {data, expiresAt}> with 5min TTL — pipeline
// data is naturally stable (changes only on stage edits, weeks apart in
// practice). Future settings-UI mutations should clear the cache by calling
// `invalidateWorkspacePipelineStagesCache(workspaceId)` (exported below) or
// just letting the TTL roll.
type CachedEntry = { data: WorkspacePipeline | null; expiresAt: number };
const PIPELINE_CACHE = new Map<string, CachedEntry>();
const PIPELINE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Returns the workspace's default pipeline with all non-archived stages ordered
 * by sort_order. Used by Prism dropdown, Deal Lens, and the future settings UI
 * to render stage lists dynamically instead of from hardcoded constants.
 * Returns null when the workspace has no default pipeline (pre-Phase-1 state).
 *
 * Cached per-workspace (5min TTL) — pipeline data is naturally stable. Each
 * page load was previously hitting this 4× (once server-side + 3× client
 * useEffects in prism / deal-lens / plan-lens), all uncached.
 */
export async function getWorkspacePipelineStages(): Promise<WorkspacePipeline | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const now = Date.now();
  const cached = PIPELINE_CACHE.get(workspaceId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const data = await fetchWorkspacePipelineStagesUncached(workspaceId);
  PIPELINE_CACHE.set(workspaceId, {
    data,
    expiresAt: now + PIPELINE_CACHE_TTL_MS,
  });
  return data;
}

/**
 * Clear cached pipeline data for a workspace. Call from settings-UI mutations
 * after editing stages so users see fresh data immediately.
 */
export async function invalidateWorkspacePipelineStagesCache(workspaceId: string): Promise<void> {
  PIPELINE_CACHE.delete(workspaceId);
}
