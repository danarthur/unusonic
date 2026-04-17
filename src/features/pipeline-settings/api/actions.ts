'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

/**
 * Stage CRUD for the Custom Pipelines settings UI.
 * All mutations require the `pipelines:manage` capability.
 * Workspace isolation is enforced by RLS on ops.pipelines / ops.pipeline_stages.
 * Atomic operations (create, reorder) route through SECURITY DEFINER RPCs that
 * re-validate the capability server-side as defense in depth.
 */

export type StageResult =
  | { success: true; stageId?: string }
  | { success: false; error: string };

export type CreateStageInput = {
  pipelineId: string;
  label: string;
  slug: string;
  tags?: string[];
  rotting_days?: number | null;
  color_token?: string | null;
  requires_confirmation?: boolean;
  opens_handoff_wizard?: boolean;
  hide_from_portal?: boolean;
};

export type UpdateStagePatch = {
  label?: string;
  tags?: string[];
  rotting_days?: number | null;
  color_token?: string | null;
  requires_confirmation?: boolean;
  opens_handoff_wizard?: boolean;
  hide_from_portal?: boolean;
};

// ── Capability gate helper ─────────────────────────────────────────────────

async function assertManagePipelines(): Promise<
  | { ok: true; workspaceId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data: hasCap, error } = await supabase.rpc('member_has_capability', {
    p_workspace_id: workspaceId,
    p_permission_key: 'pipelines:manage',
  });
  if (error) return { ok: false, error: error.message };
  if (!hasCap) return { ok: false, error: 'You do not have permission to manage pipelines.' };

  return { ok: true, workspaceId, supabase };
}

// ── createPipelineStage ────────────────────────────────────────────────────

export async function createPipelineStage(input: CreateStageInput): Promise<StageResult> {
  const gate = await assertManagePipelines();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: newId, error } = await gate.supabase.rpc('create_pipeline_stage' as never, {
    p_pipeline_id: input.pipelineId,
    p_label: input.label,
    p_slug: input.slug,
    p_tags: input.tags ?? [],
    p_rotting_days: input.rotting_days ?? null,
    p_color_token: input.color_token ?? null,
    p_requires_confirmation: input.requires_confirmation ?? false,
    p_opens_handoff_wizard: input.opens_handoff_wizard ?? false,
    p_hide_from_portal: input.hide_from_portal ?? false,
  } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/pipeline');
  revalidatePath('/crm');
  return { success: true, stageId: newId as unknown as string };
}

// ── updatePipelineStage ────────────────────────────────────────────────────

export async function updatePipelineStage(
  stageId: string,
  patch: UpdateStagePatch,
): Promise<StageResult> {
  const gate = await assertManagePipelines();
  if (!gate.ok) return { success: false, error: gate.error };

  // Reject empty patch — nothing to do, and it would be a silent no-op.
  const updateFields: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { success: false, error: 'Stage label cannot be empty.' };
    updateFields.label = patch.label;
  }
  if (patch.tags !== undefined) updateFields.tags = patch.tags;
  if (patch.rotting_days !== undefined) updateFields.rotting_days = patch.rotting_days;
  if (patch.color_token !== undefined) updateFields.color_token = patch.color_token;
  if (patch.requires_confirmation !== undefined) updateFields.requires_confirmation = patch.requires_confirmation;
  if (patch.opens_handoff_wizard !== undefined) updateFields.opens_handoff_wizard = patch.opens_handoff_wizard;
  if (patch.hide_from_portal !== undefined) updateFields.hide_from_portal = patch.hide_from_portal;

  if (Object.keys(updateFields).length === 0) {
    return { success: false, error: 'No changes supplied.' };
  }

  const { error } = await (gate.supabase as any)
    .schema('ops')
    .from('pipeline_stages')
    .update(updateFields)
    .eq('id', stageId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/pipeline');
  revalidatePath('/crm');
  return { success: true, stageId };
}

// ── archivePipelineStage ───────────────────────────────────────────────────

export async function archivePipelineStage(stageId: string): Promise<StageResult> {
  const gate = await assertManagePipelines();
  if (!gate.ok) return { success: false, error: gate.error };

  // Pull kind first — won/lost stages cannot be archived (design doc §5).
  const { data: stage, error: lookupErr } = await (gate.supabase as any)
    .schema('ops')
    .from('pipeline_stages')
    .select('kind')
    .eq('id', stageId)
    .maybeSingle();

  if (lookupErr) return { success: false, error: lookupErr.message };
  if (!stage) return { success: false, error: 'Stage not found.' };
  if (stage.kind !== 'working') {
    return { success: false, error: `${stage.kind === 'won' ? 'Won' : 'Lost'} stages cannot be archived.` };
  }

  const { error } = await (gate.supabase as any)
    .schema('ops')
    .from('pipeline_stages')
    .update({ is_archived: true })
    .eq('id', stageId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/pipeline');
  revalidatePath('/crm');
  return { success: true, stageId };
}

// ── reorderPipelineStages ──────────────────────────────────────────────────

export async function reorderPipelineStages(
  pipelineId: string,
  orderedStageIds: string[],
): Promise<StageResult> {
  const gate = await assertManagePipelines();
  if (!gate.ok) return { success: false, error: gate.error };

  if (!Array.isArray(orderedStageIds) || orderedStageIds.length === 0) {
    return { success: false, error: 'Reorder list cannot be empty.' };
  }

  const { error } = await gate.supabase.rpc('reorder_pipeline_stages' as never, {
    p_pipeline_id: pipelineId,
    p_stage_ids: orderedStageIds,
  } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/pipeline');
  revalidatePath('/crm');
  return { success: true };
}
