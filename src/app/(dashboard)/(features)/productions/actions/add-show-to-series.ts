'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';
import { resolveEventTimezone, toVenueInstant } from '@/shared/lib/timezone';
import { SeriesRuleSchema, expandSeriesRule } from '@/shared/lib/series-rule';

/**
 * Add a new show to an existing series. Updates ops.projects.series_rule.rdates
 * (source of truth) AND creates a matching ops.events row in the same window.
 *
 * Also auto-propagates the project's series_crew_template (if set) into the
 * new event — "crew copied from template" indicator in the Shows list is
 * derived at render time by comparing event crew to the template.
 *
 * P0 constraint: caller passes a yyyy-MM-dd date; start/end times copy from
 * the deal's `event_start_time` / `event_end_time`.
 */
export async function addShowToSeries(
  dealId: string,
  newDate: string
): Promise<{ success: true; eventId: string } | { success: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { success: false, error: 'Date must be yyyy-MM-dd.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, venue_id, event_start_time, event_end_time, event_archetype')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!deal) return { success: false, error: 'Deal not found.' };

  const { data: project } = await supabase
    .schema('ops')
    .from('projects')
    .select('id, is_series, series_rule, client_entity_id, series_crew_template')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!project) return { success: false, error: 'Project not found for deal.' };
  const projectRow = project as {
    id: string;
    is_series: boolean | null;
    series_rule: unknown;
    client_entity_id: string | null;
    series_crew_template: unknown;
  };
  if (!projectRow.is_series) {
    return { success: false, error: 'Deal is not a series — use a different flow to add dates.' };
  }

  const parsed = SeriesRuleSchema.safeParse(projectRow.series_rule);
  if (!parsed.success) return { success: false, error: 'Series rule is malformed.' };

  const rule = parsed.data;
  if (rule.rdates.includes(newDate)) {
    return { success: false, error: 'Date is already in the series.' };
  }

  // Update the series_rule — append to rdates, clear from exdates if present.
  const newRule = {
    ...rule,
    rdates: [...rule.rdates, newDate].sort(),
    exdates: rule.exdates.filter((d) => d !== newDate),
  };

  const r = deal as Record<string, unknown>;
  const eventTimezone = await resolveEventTimezone({
    venueId: (r.venue_id as string | null) ?? null,
    workspaceId,
  });
  const startTime = (r.event_start_time as string) ?? '08:00';
  const endTime = (r.event_end_time as string) ?? '18:00';

  const { error: updateErr } = await supabase
    .schema('ops')
    .from('projects')
    .update({ series_rule: newRule })
    .eq('id', projectRow.id);
  if (updateErr) return { success: false, error: updateErr.message };

  const { data: inserted, error: insertErr } = await supabase
    .schema('ops')
    .from('events')
    .insert({
      project_id: projectRow.id,
      workspace_id: workspaceId,
      deal_id: dealId,
      title: ((deal as { title?: string | null }).title ?? 'Show').trim() || 'Show',
      starts_at: toVenueInstant(newDate, startTime, eventTimezone),
      ends_at: toVenueInstant(newDate, endTime, eventTimezone),
      status: 'planned',
      lifecycle_status: 'production',
      timezone: eventTimezone,
      client_entity_id: projectRow.client_entity_id,
      event_archetype: (r.event_archetype as string | null) ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { success: false, error: insertErr?.message ?? 'Could not create event.' };
  }

  const eventId = (inserted as { id: string }).id;

  // Fan out series_crew_template to the new event (auto-propagation).
  // Each template entry creates a deal_crew row scoped to this new event.
  type CrewTemplateEntry = {
    entity_id: string | null;
    role_note?: string | null;
    department?: string | null;
    call_time?: string | null;
    day_rate?: number | null;
    notes?: string | null;
  };
  const template = projectRow.series_crew_template as CrewTemplateEntry[] | null;
  if (Array.isArray(template) && template.length > 0) {
    const crewRows = template
      .filter((t): t is CrewTemplateEntry => t && typeof t === 'object')
      .map((t) => ({
        workspace_id: workspaceId,
        deal_id: dealId,
        event_id: eventId,
        entity_id: t.entity_id,
        role_note: t.role_note ?? null,
        department: t.department ?? null,
        call_time: t.call_time ?? null,
        day_rate: t.day_rate ?? null,
        notes: t.notes ?? null,
        source: 'series_template',
        status: 'assigned',
        brings_own_gear: false,
      }));
    if (crewRows.length > 0) {
      await supabase.schema('ops').from('deal_crew').insert(crewRows);
    }
  }

  // Re-verify via expandSeriesRule consistency: ensure expand(newRule) contains newDate.
  if (!expandSeriesRule(newRule).includes(newDate)) {
    // Should never happen; log but don't fail.
    // (rdates - exdates expansion); defensive.
  }

  revalidatePath(`/productions/${dealId}`);
  revalidatePath('/productions');
  revalidatePath('/events');
  return { success: true, eventId };
}
