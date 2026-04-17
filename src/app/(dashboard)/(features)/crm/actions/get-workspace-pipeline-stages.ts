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
 * Returns the workspace's default pipeline with all non-archived stages ordered
 * by sort_order. Used by Prism dropdown, Deal Lens, and the future settings UI
 * to render stage lists dynamically instead of from hardcoded constants.
 * Returns null when the workspace has no default pipeline (pre-Phase-1 state).
 */
export async function getWorkspacePipelineStages(): Promise<WorkspacePipeline | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

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
