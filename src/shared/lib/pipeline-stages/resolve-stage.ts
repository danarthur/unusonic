/**
 * Server-side helpers for resolving a workspace's pipeline stage by tag, kind,
 * or slug without pulling every writer through `getWorkspacePipelineStages`.
 *
 * Phase 3i (docs/reference/custom-pipelines-design.md §4.3): writers target
 * stage_id directly. Status is derived from stage.kind by the Phase 3i BEFORE
 * trigger (`public.sync_deal_status_from_stage`). These helpers let server
 * actions resolve the correct stage_id for common intents:
 *
 *   - new deals        → tag `initial_contact` in the workspace's default pipeline
 *   - auto-advance on proposal-send → tag `contract_out`
 *   - crystallize / handover  → kind `won`
 *   - mark-lost              → kind `lost`
 *   - reopen                 → tag `initial_contact`
 *
 * Each helper returns the stage_id + the stage's current slug (useful when a
 * writer still needs the legacy slug during the rollout window). Returns null
 * if no matching stage exists.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient;

export type ResolvedStage = {
  stageId: string;
  pipelineId: string;
  slug: string;
  kind: 'working' | 'won' | 'lost';
  tags: readonly string[];
};

type RawStage = {
  id: string;
  pipeline_id: string;
  slug: string;
  kind: string;
  tags: string[] | null;
};

async function resolveDefaultPipelineId(
  supabase: Client,
  workspaceId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST types
  const { data } = await supabase
    .schema('ops')
    .from('pipelines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .eq('is_archived', false)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function normalise(raw: RawStage): ResolvedStage {
  return {
    stageId: raw.id,
    pipelineId: raw.pipeline_id,
    slug: raw.slug,
    kind: raw.kind as 'working' | 'won' | 'lost',
    tags: raw.tags ?? [],
  };
}

/**
 * Resolve the stage in the workspace's default pipeline that carries the given
 * tag. Returns null when no active stage has that tag (e.g. workspace removed
 * the tag deliberately — auto-advance is opt-out at the tag level).
 */
export async function resolveStageByTag(
  supabase: Client,
  workspaceId: string,
  tag: string,
): Promise<ResolvedStage | null> {
  const pipelineId = await resolveDefaultPipelineId(supabase, workspaceId);
  if (!pipelineId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST types
  const { data } = await supabase
    .schema('ops')
    .from('pipeline_stages')
    .select('id, pipeline_id, slug, kind, tags')
    .eq('pipeline_id', pipelineId)
    .eq('is_archived', false)
    .contains('tags', [tag])
    .limit(1)
    .maybeSingle();

  return data ? normalise(data as RawStage) : null;
}

/**
 * Resolve the single stage in the workspace's default pipeline with the given
 * kind. Partial unique indexes (Phase 2a) guarantee at most one won / one lost
 * per pipeline, so this always returns 0 or 1 rows.
 */
export async function resolveStageByKind(
  supabase: Client,
  workspaceId: string,
  kind: 'working' | 'won' | 'lost',
): Promise<ResolvedStage | null> {
  const pipelineId = await resolveDefaultPipelineId(supabase, workspaceId);
  if (!pipelineId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST types
  const { data } = await supabase
    .schema('ops')
    .from('pipeline_stages')
    .select('id, pipeline_id, slug, kind, tags')
    .eq('pipeline_id', pipelineId)
    .eq('is_archived', false)
    .eq('kind', kind)
    .limit(1)
    .maybeSingle();

  return data ? normalise(data as RawStage) : null;
}

/**
 * Resolve a stage by slug. Used by the user-facing status dropdown when the UI
 * hands back a stage slug and the action needs to convert it to a stage_id.
 */
export async function resolveStageBySlug(
  supabase: Client,
  workspaceId: string,
  slug: string,
): Promise<ResolvedStage | null> {
  const pipelineId = await resolveDefaultPipelineId(supabase, workspaceId);
  if (!pipelineId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST types
  const { data } = await supabase
    .schema('ops')
    .from('pipeline_stages')
    .select('id, pipeline_id, slug, kind, tags')
    .eq('pipeline_id', pipelineId)
    .eq('is_archived', false)
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  return data ? normalise(data as RawStage) : null;
}
