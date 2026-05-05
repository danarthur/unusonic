'use server';

/**
 * Crew comms-log + lightweight read/write actions.
 *
 * Extracted from crew-hub.ts (Phase 0.5-style split, 2026-04-29). Owns:
 *   - getCrewCommsLog: activity feed for one crew row.
 *   - getCueScheduleForCrew: ROS cues this entity is assigned to on an event.
 *   - updateCrewNotes: PM-only freeform note on ops.deal_crew.notes.
 *   - logCrewPhoneCall: manual activity entry from the rail's "Log call" action.
 */

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { CrewCommsLogEntry, CueAssignment } from './types';

// =============================================================================
// getCrewCommsLog — the activity feed for one crew row
// =============================================================================

export async function getCrewCommsLog(dealCrewId: string): Promise<CrewCommsLogEntry[]> {
  const parsed = z.string().uuid().safeParse(dealCrewId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
      .schema('ops')
      .from('crew_comms_log')
      .select('id, channel, event_type, occurred_at, actor_user_id, summary, payload')
      .eq('deal_crew_id', dealCrewId)
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      Sentry.logger.error('crm.crewHub.getCrewCommsLogFailed', {
        dealCrewId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CrewCommsLogEntry[];
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewCommsLog' } });
    return [];
  }
}

// =============================================================================
// getCueScheduleForCrew — ROS cues this entity is assigned to
//
// Returns crew-relevant cues for one person on one event. Filters on
// run_of_show_cues.assigned_crew JSONB (array of entries with entity_id).
// Ordered by start_time so it reads as a personal timeline.
// =============================================================================

export async function getCueScheduleForCrew(
  eventId: string,
  entityId: string,
): Promise<CueAssignment[]> {
  const parsedEventId = z.string().uuid().safeParse(eventId);
  const parsedEntityId = z.string().uuid().safeParse(entityId);
  if (!parsedEventId.success || !parsedEntityId.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    // assigned_crew is a JSONB array; use contains with a partial match.
    const { data, error } = await supabase
      .from('run_of_show_cues')
      .select('id, title, start_time, duration_minutes, type, notes, assigned_crew')
      .eq('event_id', eventId)
      .order('start_time', { ascending: true, nullsFirst: false });

    if (error) {
      Sentry.logger.error('crm.crewHub.getCueScheduleFailed', {
        eventId,
        entityId,
        error: error.message,
      });
      return [];
    }

    const rows = (data ?? []) as {
      id: string;
      title: string | null;
      start_time: string | null;
      duration_minutes: number;
      type: string;
      notes: string | null;
      assigned_crew: { entity_id?: string | null }[] | null;
    }[];

    return rows
      .filter((r) =>
        Array.isArray(r.assigned_crew) &&
        r.assigned_crew.some((a) => a?.entity_id === entityId),
      )
      .map((r) => ({
        cue_id: r.id,
        title: r.title,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes,
        type: r.type,
        notes: r.notes,
      }));
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCueScheduleForCrew' } });
    return [];
  }
}

// =============================================================================
// updateCrewNotes — PM-only freeform note for this person on this show.
// Writes to ops.deal_crew.notes (surfaced as crew_notes on DealCrewRow) which
// is the SAME field the notes icon on the list row toggles. Keeps a single
// source of truth instead of the parallel `internal_note` column that shipped
// in migration 20260414190000 and is now effectively unused.
// =============================================================================

const UpdateNoteSchema = z.object({
  dealCrewId: z.string().uuid(),
  note: z.string().max(4000).nullable(),
});

export async function updateCrewNotes(input: {
  dealCrewId: string;
  note: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = UpdateNoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update({ notes: parsed.data.note })
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId);

    if (error) {
      Sentry.logger.error('crm.crewHub.updateCrewNotesFailed', {
        dealCrewId: parsed.data.dealCrewId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'updateCrewNotes' } });
    return { success: false, error: message };
  }
}

// =============================================================================
// logCrewPhoneCall — manual activity entry from the rail's "Log call" action
// =============================================================================

const LogPhoneCallSchema = z.object({
  dealCrewId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  summary: z.string().max(500),
});

export async function logCrewPhoneCall(input: {
  dealCrewId: string;
  eventId: string | null;
  summary: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = LogPhoneCallSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .schema('ops')
      .from('crew_comms_log')
      .insert({
        workspace_id: workspaceId,
        deal_crew_id: parsed.data.dealCrewId,
        event_id: parsed.data.eventId,
        channel: 'phone',
        event_type: 'phone_call_logged',
        actor_user_id: user?.id ?? null,
        summary: parsed.data.summary,
        payload: {},
      });

    if (error) {
      Sentry.logger.error('crm.crewHub.logPhoneCallFailed', {
        dealCrewId: parsed.data.dealCrewId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'logCrewPhoneCall' } });
    return { success: false, error: message };
  }
}
