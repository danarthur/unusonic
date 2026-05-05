'use server';

/**
 * markAllGearReturned — close-out helper that bulk-marks every company-source
 * gear item on an event as `returned`. Skips items already terminal
 * (returned, quarantine) and skips crew/subrental items (those have their
 * own return flow).
 *
 * Used by the Plan tab's CloseOutCard. Pre-show toggling of individual gear
 * items still happens via updateGearItemStatus from the Gear Flight Check —
 * this action exists specifically because the close-out moment is "yes,
 * everything came back" and a one-click bulk action removes the friction
 * of toggling 10+ items individually after the show.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { GearHistoryEntry } from '../../components/flight-checks/types';

export type MarkAllGearReturnedResult =
  | { success: true; updated: number; skipped: number }
  | { success: false; error: string };

export async function markAllGearReturned(
  eventId: string,
): Promise<MarkAllGearReturnedResult> {
  const parsed = z.string().uuid().safeParse(eventId);
  if (!parsed.success) return { success: false, error: 'Invalid event ID.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Resolve the actor for the history entry.
  const { data: { user } } = await supabase.auth.getUser();
  let changedBy = 'unknown';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.full_name) changedBy = profile.full_name;
  }

  const { data: items, error: readErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('id, status, source, history')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  if (readErr) return { success: false, error: readErr.message };

  type Row = { id: string; status: string; source: string; history: GearHistoryEntry[] | null };
  const rows = (items ?? []) as Row[];

  const eligible = rows.filter((r) =>
    r.source === 'company' &&
    r.status !== 'returned' &&
    r.status !== 'quarantine',
  );
  const skipped = rows.length - eligible.length;

  if (eligible.length === 0) {
    return { success: true, updated: 0, skipped };
  }

  const now = new Date().toISOString();
  const newHistoryEntry: GearHistoryEntry = {
    status: 'returned',
    changed_at: now,
    changed_by: changedBy,
  };

  // Update one row at a time so history append stays accurate per-item.
  // Volume here is <50 in normal use; if it grows, fold into a single RPC.
  let updated = 0;
  for (const row of eligible) {
    const existing = Array.isArray(row.history) ? row.history : [];
    const nextHistory = [...existing, newHistoryEntry].slice(-20);
    const { error } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .update({
        status: 'returned',
        status_updated_at: now,
        status_updated_by: changedBy,
        history: nextHistory,
      })
      .eq('id', row.id)
      .eq('workspace_id', workspaceId);
    if (!error) updated++;
  }

  return { success: true, updated, skipped };
}
