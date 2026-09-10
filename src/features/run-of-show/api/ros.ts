'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/types/supabase';
import type { Cue, CueType, RosTemplate, Section, TemplateCueDef, TemplateSectionDef } from '../model/run-of-show-types';

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

/** A row as `run_of_show_cues` actually stores it: the two crew/gear lists are JSONB. */
type CueRow = Omit<Cue, 'assigned_crew' | 'assigned_gear'> & {
  assigned_crew: Json;
  assigned_gear: Json;
};

/**
 * A stored row, as a Cue.
 *
 * `assigned_crew` and `assigned_gear` are JSONB columns, so what comes back is
 * `Json` -- which is to say, anything. The rows were being handed straight to
 * callers as `Cue`, which asserted they were arrays of a particular shape
 * without ever looking. A row written by an older version of this code, or by
 * hand, or by a migration, would reach the run-of-show grid as an array it is
 * not, and the failure would land in a render rather than here.
 *
 * Non-arrays become empty lists, which is what an unassigned cue is anyway.
 */
function toCue(row: CueRow): Cue {
  return {
    ...row,
    assigned_crew: Array.isArray(row.assigned_crew)
      ? (row.assigned_crew as unknown as Cue['assigned_crew'])
      : [],
    assigned_gear: Array.isArray(row.assigned_gear)
      ? (row.assigned_gear as unknown as Cue['assigned_gear'])
      : [],
  };
}

export async function fetchCues(eventId: string): Promise<Cue[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(toCue);
}

export async function updateCueOrder(items: Cue[]): Promise<void> {
  if (items.length === 0) return;

  const supabase = await createClient();

  const updates = items.map((item, index) =>
    supabase
      .from('run_of_show_cues')
      .update({ sort_order: index, section_id: item.section_id ?? null })
      .eq('id', item.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed?.error) throw new Error(failed.error.message);
}

export async function createCue(eventId: string, cue: Partial<Cue>): Promise<Cue> {
  const supabase = await createClient();

  const { data: lastCue, error: lastError } = await supabase
    .from('run_of_show_cues')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw new Error(lastError.message);

  const sortOrder = (lastCue?.sort_order ?? -1) + 1;
  const nextType: CueType = cue.type ?? 'stage';

  const { data, error } = await supabase
    .from('run_of_show_cues')
    .insert({
      event_id: eventId,
      title: cue.title ?? 'New Cue',
      start_time: cue.start_time ?? null,
      duration_minutes: cue.duration_minutes ?? 10,
      type: nextType,
      notes: cue.notes ?? null,
      sort_order: sortOrder,
      is_pre_show: cue.is_pre_show ?? false,
      assigned_crew: (cue.assigned_crew ?? []) as unknown as Json,
      assigned_gear: (cue.assigned_gear ?? []) as unknown as Json,
      section_id: cue.section_id ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return toCue(data);
}

export async function updateCue(eventId: string, cueId: string, updates: Partial<Cue>): Promise<Cue> {
  const supabase = await createClient();

  /*
    The two list fields go back out as JSONB. `created_at` and `updated_at` are
    dropped: they are the database's to set, and `Cue` types them as nullable,
    so a caller spreading a whole cue back in would try to write null over them.
  */
  const { assigned_crew, assigned_gear, created_at: _created, updated_at: _updated, ...rest } = updates;
  void _created;
  void _updated;
  const payload = {
    ...rest,
    ...(assigned_crew !== undefined ? { assigned_crew: assigned_crew as unknown as Json } : {}),
    ...(assigned_gear !== undefined ? { assigned_gear: assigned_gear as unknown as Json } : {}),
  };

  const { data, error } = await supabase
    .from('run_of_show_cues')
    .update(payload)
    .eq('id', cueId)
    .eq('event_id', eventId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return toCue(data);
}

export async function deleteCue(eventId: string, cueId: string): Promise<Cue[]> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('run_of_show_cues')
    .delete()
    .eq('id', cueId)
    .eq('event_id', eventId);

  if (error) throw new Error(error.message);

  const { data, error: fetchError } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (fetchError) throw new Error(fetchError.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return (data ?? []).map(toCue);
}

export async function duplicateCue(
  eventId: string,
  cueId: string
): Promise<{ cues: Cue[]; newCueId: string }> {
  const supabase = await createClient();

  const { data: cue, error: cueError } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('id', cueId)
    .eq('event_id', eventId)
    .single();

  if (cueError || !cue) throw new Error(cueError?.message ?? 'Cue not found');

  const source = toCue(cue);
  const nextOrder = source.sort_order + 1;

  const { data: shifted, error: shiftFetchError } = await supabase
    .from('run_of_show_cues')
    .select('id, sort_order')
    .eq('event_id', eventId)
    .gte('sort_order', nextOrder)
    .order('sort_order', { ascending: false });

  if (shiftFetchError) throw new Error(shiftFetchError.message);

  const shiftUpdates = (shifted ?? []).map((item) =>
    supabase
      .from('run_of_show_cues')
      .update({ sort_order: item.sort_order + 1 })
      .eq('id', item.id)
  );

  const shiftResults = await Promise.all(shiftUpdates);
  const shiftFailed = shiftResults.find((result) => result.error);
  if (shiftFailed?.error) throw new Error(shiftFailed.error.message);

  const { data: newCue, error: insertError } = await supabase
    .from('run_of_show_cues')
    .insert({
      event_id: eventId,
      title: `${source.title} Copy`,
      start_time: source.start_time,
      duration_minutes: source.duration_minutes,
      type: source.type,
      notes: source.notes,
      sort_order: nextOrder,
      is_pre_show: source.is_pre_show ?? false,
      assigned_crew: source.assigned_crew as unknown as Json,
      assigned_gear: source.assigned_gear as unknown as Json,
      section_id: source.section_id ?? null,
    })
    .select('*')
    .single();

  if (insertError || !newCue) throw new Error(insertError?.message ?? 'Failed to duplicate cue');

  const { data, error: fetchError } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (fetchError) throw new Error(fetchError.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return { cues: (data ?? []).map(toCue), newCueId: newCue.id };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function fetchSections(eventId: string): Promise<Section[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('run_of_show_sections')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSection(eventId: string, section: Partial<Section>): Promise<Section> {
  const supabase = await createClient();

  const { data: lastSection } = await supabase
    .from('run_of_show_sections')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (lastSection?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('run_of_show_sections')
    .insert({
      event_id: eventId,
      title: section.title ?? 'Untitled Section',
      color: section.color ?? null,
      sort_order: sortOrder,
      start_time: section.start_time ?? null,
      notes: section.notes ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return data;
}

export async function updateSection(
  eventId: string,
  sectionId: string,
  updates: Partial<Section>
): Promise<Section> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('run_of_show_sections')
    .update(updates)
    .eq('id', sectionId)
    .eq('event_id', eventId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return data;
}

export async function deleteSection(eventId: string, sectionId: string): Promise<void> {
  const supabase = await createClient();

  // Cues in this section will have section_id set to null (ON DELETE SET NULL)
  const { error } = await supabase
    .from('run_of_show_sections')
    .delete()
    .eq('id', sectionId)
    .eq('event_id', eventId);

  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/run-of-show`);
}

export async function updateSectionOrder(sections: Section[]): Promise<void> {
  if (sections.length === 0) return;

  const supabase = await createClient();

  const updates = sections.map((section, index) =>
    supabase
      .from('run_of_show_sections')
      .update({ sort_order: index })
      .eq('id', section.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed?.error) throw new Error(failed.error.message);
}

// ---------------------------------------------------------------------------
// RoS Templates
// ---------------------------------------------------------------------------

/** A stored template row. Sections ride inside the `cues` JSONB, not a column. */
type RosTemplateRow = Omit<RosTemplate, 'cues' | 'sections'> & { cues: Json };

/**
 * A stored template row, as a RosTemplate.
 *
 * Old templates hold `cues` as a plain array; newer ones wrap both lists as
 * `{ __cues, __sections }`, because `ops.workspace_ros_templates` has no
 * sections column. Anything matching neither shape becomes an empty cue list
 * rather than being handed to the picker as an array it is not -- and says so,
 * so a legacy snapshot can be re-imported rather than quietly lost.
 */
function toRosTemplate(row: RosTemplateRow): RosTemplate {
  const raw = row.cues as unknown;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && '__cues' in (raw as Record<string, unknown>)) {
    const wrapped = raw as { __cues: TemplateCueDef[]; __sections: TemplateSectionDef[] };
    return { ...row, cues: wrapped.__cues ?? [], sections: wrapped.__sections ?? [] };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    console.warn('[ros] template shape not recognised', { templateId: row.id });
  }
  return { ...row, cues: Array.isArray(raw) ? (raw as TemplateCueDef[]) : [], sections: [] };
}

export async function fetchRosTemplates(): Promise<RosTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('workspace_ros_templates')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(toRosTemplate);
}

export async function saveRosTemplate(
  name: string,
  description: string | null,
  cues: Cue[],
  sections: Section[],
): Promise<RosTemplate> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) throw new Error('No active workspace.');

  const supabase = await createClient();

  // Build section index: real section_id → index in sections array
  const sectionIndex = new Map<string, number>();
  const templateSections: TemplateSectionDef[] = sections.map((s, i) => {
    sectionIndex.set(s.id, i);
    return { title: s.title, color: s.color, sort_order: s.sort_order, start_time: s.start_time, notes: s.notes };
  });

  const templateCues: TemplateCueDef[] = cues.map((cue, i) => ({
    title: cue.title,
    duration_minutes: cue.duration_minutes,
    type: cue.type,
    notes: cue.notes,
    is_pre_show: cue.is_pre_show,
    assigned_crew: cue.assigned_crew ?? [],
    assigned_gear: cue.assigned_gear ?? [],
    start_time: cue.start_time,
    sort_order: i,
    section_ref: cue.section_id ? sectionIndex.get(cue.section_id) : undefined,
  }));

  // Store sections inside the cues JSONB column as a combined payload.
  // Old templates have cues as a plain array; new templates use { __cues, __sections } wrapper.
  // applyRosTemplate and fetchRosTemplates handle both formats.
  const cuesPayload = templateSections.length > 0
    ? { __cues: templateCues, __sections: templateSections }
    : templateCues;

  const { data, error } = await supabase
    .schema('ops')
    .from('workspace_ros_templates')
    .insert({
      workspace_id: workspaceId,
      name,
      description,
      cues: cuesPayload as unknown as Json,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return toRosTemplate(data);
}

export async function deleteRosTemplate(templateId: string): Promise<void> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) throw new Error('No active workspace.');

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_ros_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw new Error(error.message);
}

/** Apply a template to an event: creates sections first, then cues with correct section_id FKs. */
export async function applyRosTemplate(
  eventId: string,
  templateId: string,
): Promise<{ cues: Cue[]; sections: Section[] }> {
  const supabase = await createClient();

  // Fetch template
  const { data: tpl, error: tplError } = await supabase
    .schema('ops')
    .from('workspace_ros_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (tplError || !tpl) throw new Error(tplError?.message ?? 'Template not found');

  // Normalize: handle both old (plain array) and new ({ __cues, __sections }) formats
  const raw = tpl.cues as unknown;
  let templateSections: TemplateSectionDef[] = [];
  let templateCues: TemplateCueDef[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && '__cues' in (raw as Record<string, unknown>)) {
    const wrapped = raw as { __cues: TemplateCueDef[]; __sections: TemplateSectionDef[] };
    templateCues = wrapped.__cues ?? [];
    templateSections = wrapped.__sections ?? [];
  } else {
    templateCues = (raw ?? []) as TemplateCueDef[];
  }

  // Create sections and build index → real ID map
  const sectionIdMap = new Map<number, string>();
  for (let i = 0; i < templateSections.length; i++) {
    const sec = templateSections[i];
    const { data: created, error: secError } = await supabase
      .from('run_of_show_sections')
      .insert({
        event_id: eventId,
        title: sec.title,
        color: sec.color,
        sort_order: sec.sort_order,
        start_time: sec.start_time,
        notes: sec.notes,
      })
      .select('id')
      .single();

    if (secError) throw new Error(secError.message);
    sectionIdMap.set(i, created.id);
  }

  // Create cues
  for (const cue of templateCues) {
    if (cue.section_ref !== undefined && cue.section_ref >= templateSections.length) {
      // Reject malformed templates instead of silently dropping the section_id —
      // a stray out-of-range ref means the template was edited by an old client
      // or the on-disk JSONB drifted from sections. Better to fail loud here than
      // create unsectioned cues the user can't trace.
      throw new Error(
        `Template cue "${cue.title ?? '(untitled)'}" references section ${cue.section_ref} but only ${templateSections.length} sections exist.`,
      );
    }
    const sectionId = cue.section_ref !== undefined ? sectionIdMap.get(cue.section_ref) ?? null : null;

    const { error: cueError } = await supabase
      .from('run_of_show_cues')
      .insert({
        event_id: eventId,
        title: cue.title ?? 'New Cue',
        start_time: cue.start_time ?? null,
        duration_minutes: cue.duration_minutes ?? 10,
        type: cue.type ?? 'stage',
        notes: cue.notes ?? null,
        sort_order: cue.sort_order,
        is_pre_show: cue.is_pre_show ?? false,
        assigned_crew: (cue.assigned_crew ?? []) as unknown as Json,
        assigned_gear: (cue.assigned_gear ?? []) as unknown as Json,
        section_id: sectionId,
      });

    if (cueError) throw new Error(cueError.message);
  }

  // Refetch and return
  const [cues, sections] = await Promise.all([
    fetchCues(eventId),
    fetchSections(eventId),
  ]);

  revalidatePath(`/events/${eventId}/run-of-show`);
  return { cues, sections };
}
