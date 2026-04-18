'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { resolveEventTimezone, toVenueInstant } from '@/shared/lib/timezone';
import { resolveStageByKind } from '@/shared/lib/pipeline-stages/resolve-stage';

export type CrystallizeResult =
  | { success: true; eventId: string }
  | { success: false; error: string };

/**
 * Marks a deal as won, creates an ops.events row, and links deal.event_id.
 * Requires a project for the workspace (ops.projects); uses first project if multiple.
 */
export async function crystallizeDeal(dealId: string): Promise<CrystallizeResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();

  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('id, title, status, proposed_date, workspace_id, event_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (dealErr || !deal) {
    return { success: false, error: 'Deal not found.' };
  }

  const r = deal as Record<string, unknown>;
  if (r.event_id) {
    return { success: true, eventId: r.event_id as string };
  }

  // Phase 3i: crystallize requires the deal to be in a working stage. After
  // the collapse migration, status ∈ {'working', 'won', 'lost'} — the legacy
  // slugs 'inquiry' / 'proposal' / 'contract_sent' / 'contract_signed' /
  // 'deposit_received' are still valid pre-collapse for safety.
  const status = (r.status as string) ?? '';
  const crystallizable = new Set([
    'working',
    // Legacy — still valid during dual-write rollout window:
    'inquiry', 'proposal', 'contract_sent', 'contract_signed', 'deposit_received',
  ]);
  if (!crystallizable.has(status)) {
    return { success: false, error: 'Deal is not in a crystallizable state.' };
  }

  const { data: projects, error: projErr } = await supabase
    .schema('ops')
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1);

  if (projErr || !projects?.length) {
    return { success: false, error: 'No project found for workspace. Add a project first.' };
  }

  const projectId = (projects[0] as { id: string }).id;
  const proposedDate = r.proposed_date ? String(r.proposed_date) : new Date().toISOString().slice(0, 10);
  const title = (r.title as string)?.trim() || 'Untitled Production';

  // §3.2: resolve timezone instead of hardcoding UTC. No venue on crystallize path.
  const eventTimezone = await resolveEventTimezone({ workspaceId });
  const startAt = toVenueInstant(proposedDate, '08:00', eventTimezone);
  const endAt = toVenueInstant(proposedDate, '18:00', eventTimezone);

  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      title,
      starts_at: startAt,
      ends_at: endAt,
      timezone: eventTimezone,
      status: 'planned',
      lifecycle_status: 'production',
    })
    .select('id')
    .single();

  if (eventErr) {
    console.error('[CRM] crystallizeDeal insert event:', eventErr.message);
    return { success: false, error: eventErr.message };
  }

  const eventId = (event as { id: string }).id;

  // Phase 3i: look up the workspace's won stage and write stage_id. The BEFORE
  // trigger derives deals.status = 'won' (kind). Covers renamed-stage workspaces
  // because we resolve by kind, not slug.
  const wonStage = await resolveStageByKind(supabase, workspaceId, 'won');
  if (!wonStage) {
    console.error('[CRM] crystallizeDeal: workspace has no won stage in default pipeline');
    return { success: false, error: 'Workspace has no won stage in its default pipeline.' };
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update({
      stage_id: wonStage.stageId,
      event_id: eventId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('workspace_id', workspaceId);

  if (updateErr) {
    console.error('[CRM] crystallizeDeal update deal:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  revalidatePath('/crm');
  revalidatePath('/');
  return { success: true, eventId };
}
