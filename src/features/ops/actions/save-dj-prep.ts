'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { flattenTimelines, type DjProgramDataV3, type SaveDjPrepResult } from '@/features/ops/lib/dj-prep-schema';

/**
 * Save DJ program data to the event's run_of_show_data JSONB.
 * Accepts v2 program data (moments + song pool).
 * Merges DJ-namespaced keys without overwriting other data.
 */
export async function saveDjPrep(
  eventId: string,
  data: Partial<DjProgramDataV3>,
): Promise<SaveDjPrepResult> {
  if (!eventId) return { ok: false, error: 'Missing event ID.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Verify user has access to this event via a crew assignment
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { ok: false, error: 'No linked profile.' };

  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('entity_id', person.id)
    .limit(1)
    .maybeSingle();

  if (!assignment) return { ok: false, error: 'Not assigned to this event.' };

  // If saving v3 timelines, also write flattened dj_program_moments for Bridge API compat
  const patch = { ...data } as Record<string, unknown>;
  if (data.dj_program_timelines) {
    const flatMoments = flattenTimelines(data.dj_program_timelines);
    patch.dj_program_moments = flatMoments;
  }

  // Atomic JSONB merge via RPC
  const { error } = await supabase.rpc('patch_event_ros_data', {
    p_event_id: eventId,
    p_patch: patch,
  });

  if (error) {
    console.error('[saveDjPrep]', error.message);
    return { ok: false, error: 'Failed to save.' };
  }

  // Sync DJ program moments → ROS cues (so PM sees them in the production timeline)
  const timelines = data.dj_program_timelines;
  const allMoments = timelines ? flattenTimelines(timelines) : [];

  if (allMoments.length > 0) {
    try {
      // Delete existing DJ-sourced cues for this event, then re-insert.
      await supabase
        .from('run_of_show_cues')
        .delete()
        .eq('event_id', eventId)
        .like('notes', '[DJ]%');

      const songPool = data.dj_song_pool ?? [];
      const multiTimeline = (timelines?.length ?? 0) > 1;
      let globalSort = 0;

      const cueInserts: {
        event_id: string; title: string; start_time: string | null;
        duration_minutes: number; type: 'stage'; notes: string;
        sort_order: number; is_pre_show: boolean;
        assigned_crew: unknown[]; assigned_gear: unknown[];
      }[] = [];

      for (const tl of (timelines ?? [])) {
        for (const moment of tl.moments) {
          const cuedSongs = songPool
            .filter(s => s.assigned_moment_id === moment.id && s.tier === 'cued')
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(s => s.artist ? `${s.artist} — ${s.title}` : s.title);

          const noteParts = ['[DJ]'];
          if (cuedSongs.length > 0) noteParts.push(cuedSongs.join(', '));
          if (moment.notes) noteParts.push(moment.notes);

          const title = multiTimeline
            ? `[${tl.name}] ${moment.label || 'Untitled moment'}`
            : moment.label || 'Untitled moment';

          cueInserts.push({
            event_id: eventId,
            title,
            start_time: moment.time || null,
            duration_minutes: 10,
            type: 'stage',
            notes: noteParts.join(' ').trim(),
            sort_order: globalSort++,
            is_pre_show: false,
            assigned_crew: [],
            assigned_gear: [],
          });
        }
      }

      if (cueInserts.length > 0) {
        await supabase.from('run_of_show_cues').insert(cueInserts);
      }
    } catch (syncErr) {
      // Non-critical — DJ prep saved, ROS sync is best-effort
      console.error('[saveDjPrep] ROS cue sync failed:', syncErr);
    }
  }

  return { ok: true };
}
