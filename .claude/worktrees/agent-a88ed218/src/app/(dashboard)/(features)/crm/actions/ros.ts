'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Cue, CueType } from './run-of-show-types';

export async function fetchCues(eventId: string): Promise<Cue[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function updateCueOrder(items: Cue[]): Promise<void> {
  if (items.length === 0) return;

  const supabase = await createClient();

  const updates = items.map((item, index) =>
    supabase
      .from('run_of_show_cues')
      .update({ sort_order: index })
      .eq('id', item.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    throw new Error(failed.error.message);
  }
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

  if (lastError) {
    throw new Error(lastError.message);
  }

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
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateCue(eventId: string, cueId: string, updates: Partial<Cue>): Promise<Cue> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('run_of_show_cues')
    .update(updates)
    .eq('id', cueId)
    .eq('event_id', eventId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/crm/${eventId}`);
  return data;
}

export async function deleteCue(eventId: string, cueId: string): Promise<Cue[]> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('run_of_show_cues')
    .delete()
    .eq('id', cueId)
    .eq('event_id', eventId);

  if (error) {
    throw new Error(error.message);
  }

  const { data, error: fetchError } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  revalidatePath(`/crm/${eventId}`);
  return data ?? [];
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

  if (cueError || !cue) {
    throw new Error(cueError?.message ?? 'Cue not found');
  }

  const nextOrder = cue.sort_order + 1;

  const { data: shifted, error: shiftFetchError } = await supabase
    .from('run_of_show_cues')
    .select('id, sort_order')
    .eq('event_id', eventId)
    .gte('sort_order', nextOrder)
    .order('sort_order', { ascending: false });

  if (shiftFetchError) {
    throw new Error(shiftFetchError.message);
  }

  const shiftUpdates = (shifted ?? []).map((item) =>
    supabase
      .from('run_of_show_cues')
      .update({ sort_order: item.sort_order + 1 })
      .eq('id', item.id)
  );

  const shiftResults = await Promise.all(shiftUpdates);
  const shiftFailed = shiftResults.find((result) => result.error);
  if (shiftFailed?.error) {
    throw new Error(shiftFailed.error.message);
  }

  const { data: newCue, error: insertError } = await supabase
    .from('run_of_show_cues')
    .insert({
      event_id: eventId,
      title: `${cue.title} Copy`,
      start_time: cue.start_time,
      duration_minutes: cue.duration_minutes,
      type: cue.type,
      notes: cue.notes,
      sort_order: nextOrder,
    })
    .select('*')
    .single();

  if (insertError || !newCue) {
    throw new Error(insertError?.message ?? 'Failed to duplicate cue');
  }

  const { data, error: fetchError } = await supabase
    .from('run_of_show_cues')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  revalidatePath(`/crm/${eventId}`);
  return { cues: data ?? [], newCueId: newCue.id };
}
