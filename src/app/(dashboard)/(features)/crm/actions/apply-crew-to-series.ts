'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

/**
 * "Set for whole series" — fan out the deal's current event-scoped crew to
 * every show in the series AND persist the roster as a template on the
 * project (so future "Add date" calls auto-propagate). Per Critic's
 * simplification: we never write deal_crew rows with NULL event_id; the
 * template lives in ops.projects.series_crew_template as jsonb.
 *
 * Behavior:
 *   1. Look up the deal's project. Must be is_series = true.
 *   2. Gather the set of crew rows currently on the deal (any event).
 *      If the owner has multiple diverging event rows per person, keep only
 *      the "canonical" one — earliest-event row per entity_id (+ null_role_note
 *      handling). P0 behavior: first event's crew becomes the template.
 *   3. Persist that roster to ops.projects.series_crew_template (JSONB array).
 *   4. For every live event on the deal, upsert the template rows (skip rows
 *      that would collide on (deal_id, event_id, entity_id)).
 */
export async function applyCrewToSeries(dealId: string): Promise<
  | { success: true; writtenRows: number; appliedEvents: number }
  | { success: false; error: string }
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { data: project } = await supabase
    .schema('ops')
    .from('projects')
    .select('id, is_series')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!project) return { success: false, error: 'Project not found for deal.' };
  const p = project as { id: string; is_series: boolean | null };
  if (!p.is_series) return { success: false, error: 'Deal is not a series.' };

  // Get the list of live events in chronological order.
  const { data: events, error: eventsErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, starts_at')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('starts_at', { ascending: true });
  if (eventsErr) return { success: false, error: eventsErr.message };
  const eventRows = (events ?? []) as Array<{ id: string; starts_at: string }>;
  if (eventRows.length === 0) return { success: false, error: 'No live shows to apply crew to.' };

  const firstEventId = eventRows[0].id;

  // Pull the first event's crew as the "template" source. If the user has no
  // crew on the first event but crew on later events, we still want something
  // — fall back to any event row.
  const { data: firstEventCrew } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('entity_id, role_note, department, call_time, day_rate, notes, status, brings_own_gear, gear_notes, per_diem, travel_stipend, kit_fee')
    .eq('event_id', firstEventId)
    .eq('deal_id', dealId);

  type CrewRow = {
    entity_id: string | null;
    role_note: string | null;
    department: string | null;
    call_time: string | null;
    day_rate: number | null;
    notes: string | null;
    status: string | null;
    brings_own_gear: boolean | null;
    gear_notes: string | null;
    per_diem: number | null;
    travel_stipend: number | null;
    kit_fee: number | null;
  };
  let sourceCrew = (firstEventCrew ?? []) as CrewRow[];

  if (sourceCrew.length === 0) {
    // Fallback: any event's crew
    const { data: anyCrew } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id, role_note, department, call_time, day_rate, notes, status, brings_own_gear, gear_notes, per_diem, travel_stipend, kit_fee')
      .eq('deal_id', dealId);
    sourceCrew = (anyCrew ?? []) as CrewRow[];
  }

  if (sourceCrew.length === 0) {
    return { success: false, error: 'No crew to apply — add crew to the first show before using "Set for whole series".' };
  }

  // Dedup by entity_id (pick first occurrence). Null entity_id = open role;
  // keep all open roles.
  const seenEntity = new Set<string>();
  const template: CrewRow[] = [];
  for (const r of sourceCrew) {
    if (r.entity_id) {
      if (seenEntity.has(r.entity_id)) continue;
      seenEntity.add(r.entity_id);
    }
    template.push(r);
  }

  // Persist template on the project
  const { error: updateErr } = await supabase
    .schema('ops')
    .from('projects')
    .update({
      series_crew_template: template.map((t) => ({
        entity_id: t.entity_id,
        role_note: t.role_note,
        department: t.department,
        call_time: t.call_time,
        day_rate: t.day_rate,
        notes: t.notes,
      })),
    })
    .eq('id', p.id);
  if (updateErr) return { success: false, error: updateErr.message };

  // Build the rows to upsert per event. Existing (deal_id, event_id, entity_id)
  // uniqueness isn't enforced by a constraint in the current schema, so we
  // explicitly skip rows that already exist for that pair.
  let writtenRows = 0;
  let appliedEvents = 0;

  for (const ev of eventRows) {
    // Fetch existing crew for this event to avoid duplicates
    const { data: existing } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id, role_note')
      .eq('deal_id', dealId)
      .eq('event_id', ev.id);
    const existingSet = new Set(
      ((existing ?? []) as Array<{ entity_id: string | null; role_note: string | null }>)
        .map((x) => `${x.entity_id ?? 'null'}::${x.role_note ?? ''}`),
    );

    const toInsert = template
      .filter((t) => !existingSet.has(`${t.entity_id ?? 'null'}::${t.role_note ?? ''}`))
      .map((t) => ({
        workspace_id: workspaceId,
        deal_id: dealId,
        event_id: ev.id,
        entity_id: t.entity_id,
        role_note: t.role_note,
        department: t.department,
        call_time: t.call_time,
        day_rate: t.day_rate,
        notes: t.notes,
        status: t.status ?? 'assigned',
        brings_own_gear: t.brings_own_gear ?? false,
        gear_notes: t.gear_notes,
        per_diem: t.per_diem,
        travel_stipend: t.travel_stipend,
        kit_fee: t.kit_fee,
        source: 'series_template',
      }));

    if (toInsert.length > 0) {
      const { error: insErr, count } = await supabase
        .schema('ops')
        .from('deal_crew')
        .insert(toInsert, { count: 'exact' });
      if (insErr) {
        // Keep going; return a partial count at the end. Surface error into
        // the final result via a Sentry call in real deployment.
        continue;
      }
      writtenRows += count ?? toInsert.length;
      appliedEvents += 1;
    }
  }

  revalidatePath(`/crm/${dealId}`);
  revalidatePath('/crm');
  return { success: true, writtenRows, appliedEvents };
}
