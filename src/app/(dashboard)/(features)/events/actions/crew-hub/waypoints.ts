'use server';

/**
 * Crew waypoint CRUD — per-person time markers augmenting deal_crew.call_time.
 *
 * Extracted from crew-hub.ts (Phase 0.5-style split, 2026-04-29). Owns:
 *   - listCrewWaypoints, addCrewWaypoint, updateCrewWaypoint, removeCrewWaypoint.
 *
 * deal_crew.call_time stays the "primary call" (what shows on the crew row
 * and the day sheet header). Waypoints are additional timed steps this
 * person needs to hit: truck pickup, gear pickup, venue arrival, set-by
 * deadline, doors, wrap, or custom.
 */

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { TIME_24H_RE, WAYPOINT_KINDS, type CrewWaypoint, type WaypointKind } from './types';

export async function listCrewWaypoints(dealCrewId: string): Promise<CrewWaypoint[]> {
  const parsed = z.string().uuid().safeParse(dealCrewId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .select('id, deal_crew_id, kind, custom_label, time, location_name, location_address, notes, sort_order, actual_time, created_at, updated_at')
      .eq('deal_crew_id', dealCrewId)
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      Sentry.logger.error('crm.crewHub.listWaypointsFailed', {
        dealCrewId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CrewWaypoint[];
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'listCrewWaypoints' } });
    return [];
  }
}

const AddWaypointSchema = z
  .object({
    dealCrewId: z.string().uuid(),
    kind: z.enum(WAYPOINT_KINDS),
    customLabel: z.string().max(100).nullable().optional(),
    time: z.string().regex(TIME_24H_RE),
    locationName: z.string().max(200).nullable().optional(),
    locationAddress: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine(
    (v) => (v.kind === 'custom' ? !!v.customLabel?.trim() : true),
    { message: 'customLabel required when kind=custom', path: ['customLabel'] },
  );

export async function addCrewWaypoint(input: {
  dealCrewId: string;
  kind: WaypointKind;
  customLabel?: string | null;
  time: string;
  locationName?: string | null;
  locationAddress?: string | null;
  notes?: string | null;
  sortOrder?: number;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = AddWaypointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    // Derive the next sort_order when not supplied — append to the end.
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const { data: existing } = await supabase
        .schema('ops')
        .from('deal_crew_waypoints')
        .select('sort_order')
        .eq('deal_crew_id', parsed.data.dealCrewId)
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const max = existing && existing.length > 0
        ? (existing[0] as { sort_order: number }).sort_order
        : -1;
      sortOrder = max + 1;
    }

    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .insert({
        workspace_id: workspaceId,
        deal_crew_id: parsed.data.dealCrewId,
        kind: parsed.data.kind,
        // Schema constraint requires custom_label null for non-custom kinds.
        custom_label: parsed.data.kind === 'custom' ? (parsed.data.customLabel ?? null) : null,
        time: parsed.data.time,
        location_name: parsed.data.locationName ?? null,
        location_address: parsed.data.locationAddress ?? null,
        notes: parsed.data.notes ?? null,
        sort_order: sortOrder,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Insert failed' };
    }
    return { success: true, id: (data as { id: string }).id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'addCrewWaypoint' } });
    return { success: false, error: message };
  }
}

const UpdateWaypointSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      kind: z.enum(WAYPOINT_KINDS).optional(),
      customLabel: z.string().max(100).nullable().optional(),
      time: z.string().regex(TIME_24H_RE).optional(),
      locationName: z.string().max(200).nullable().optional(),
      locationAddress: z.string().max(500).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
      actualTime: z.string().datetime().nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: 'Empty patch' }),
});

export async function updateCrewWaypoint(input: {
  id: string;
  patch: {
    kind?: WaypointKind;
    customLabel?: string | null;
    time?: string;
    locationName?: string | null;
    locationAddress?: string | null;
    notes?: string | null;
    sortOrder?: number;
    actualTime?: string | null;
  };
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = UpdateWaypointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('kind' in parsed.data.patch && parsed.data.patch.kind !== undefined) {
      dbPatch.kind = parsed.data.patch.kind;
      // If we're switching away from custom, clear the stale custom_label so
      // the check constraint passes.
      if (parsed.data.patch.kind !== 'custom' && !('customLabel' in parsed.data.patch)) {
        dbPatch.custom_label = null;
      }
    }
    if ('customLabel' in parsed.data.patch) dbPatch.custom_label = parsed.data.patch.customLabel ?? null;
    if ('time' in parsed.data.patch) dbPatch.time = parsed.data.patch.time;
    if ('locationName' in parsed.data.patch) dbPatch.location_name = parsed.data.patch.locationName ?? null;
    if ('locationAddress' in parsed.data.patch) dbPatch.location_address = parsed.data.patch.locationAddress ?? null;
    if ('notes' in parsed.data.patch) dbPatch.notes = parsed.data.patch.notes ?? null;
    if ('sortOrder' in parsed.data.patch) dbPatch.sort_order = parsed.data.patch.sortOrder;
    if ('actualTime' in parsed.data.patch) dbPatch.actual_time = parsed.data.patch.actualTime ?? null;

    const { error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .update(dbPatch)
      .eq('id', parsed.data.id)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'updateCrewWaypoint' } });
    return { success: false, error: message };
  }
}

export async function removeCrewWaypoint(input: {
  id: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid id.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .delete()
      .eq('id', parsed.data.id)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'removeCrewWaypoint' } });
    return { success: false, error: message };
  }
}
