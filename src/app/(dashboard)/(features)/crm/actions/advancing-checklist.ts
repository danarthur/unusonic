'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { AdvancingChecklistItem } from '../lib/advancing-checklist-types';
import { DEFAULT_CHECKLIST_ITEMS, ARCHETYPE_TEMPLATES } from '../lib/advancing-checklist-types';

const uuidSchema = z.string().uuid();

// =============================================================================
// Helpers
// =============================================================================

async function readChecklist(
  eventId: string,
  workspaceId: string,
): Promise<{ items: AdvancingChecklistItem[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('events')
    .select('advancing_checklist')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('[CRM] readChecklist:', error.message);
    return { items: [], error: error.message };
  }
  if (!data) return { items: [], error: 'Event not found.' };

  const raw = (data as Record<string, unknown>).advancing_checklist;
  const items = Array.isArray(raw) ? (raw as AdvancingChecklistItem[]) : [];
  return { items, error: null };
}

async function writeChecklist(
  eventId: string,
  workspaceId: string,
  items: AdvancingChecklistItem[],
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ advancing_checklist: items as unknown as Record<string, unknown> })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] writeChecklist:', error.message);
    return error.message;
  }
  return null;
}

// =============================================================================
// Public actions
// =============================================================================

export async function getAdvancingChecklist(
  eventId: string,
): Promise<AdvancingChecklistItem[]> {
  if (!uuidSchema.safeParse(eventId).success) return [];
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const { items } = await readChecklist(eventId, workspaceId);
  return items;
}

/** Auto-keys that only apply when a company/rental vehicle is involved. */
const TRUCK_ONLY_AUTO_KEYS = new Set(['truck_loaded', 'gear_all_pulled']);
/** Auto-keys that only apply when crew-sourced gear exists. */
const CREW_GEAR_AUTO_KEYS = new Set(['crew_gear_confirmed']);

export async function seedAdvancingChecklist(
  eventId: string,
  archetype?: string | null,
  /** Transport mode — when 'none' or 'personal_vehicle', truck-related items are excluded from seed. */
  transportMode?: string | null,
  /** Whether the event has crew-sourced gear items. When false, crew_gear_confirmed is excluded. */
  hasCrewGear?: boolean,
): Promise<AdvancingChecklistItem[]> {
  if (!uuidSchema.safeParse(eventId).success) return [];
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const { items: existing } = await readChecklist(eventId, workspaceId);
  if (existing.length > 0) return existing;

  const template = (archetype && ARCHETYPE_TEMPLATES[archetype]) || DEFAULT_CHECKLIST_ITEMS;

  // Filter out truck-related items when no truck is involved
  const needsTruck = !transportMode || transportMode === 'company_van' || transportMode === 'rental_truck';
  const filtered = template.filter((item) => {
    if (!item.auto_key) return true;
    if (TRUCK_ONLY_AUTO_KEYS.has(item.auto_key) && !needsTruck) return false;
    if (CREW_GEAR_AUTO_KEYS.has(item.auto_key) && !hasCrewGear) return false;
    return true;
  });

  const seeded: AdvancingChecklistItem[] = filtered.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
  }));

  const err = await writeChecklist(eventId, workspaceId, seeded);
  if (err) return [];
  return seeded;
}

export async function toggleAdvancingItem(
  eventId: string,
  itemId: string,
  done: boolean,
  userName: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(eventId).success) return false;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;

  const { items, error } = await readChecklist(eventId, workspaceId);
  if (error) return false;

  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return false;

  items[idx] = {
    ...items[idx],
    done,
    done_by: done ? userName : null,
    done_at: done ? new Date().toISOString() : null,
  };

  const writeErr = await writeChecklist(eventId, workspaceId, items);
  return !writeErr;
}

/**
 * Apply many auto-state toggles in a single read-modify-write pass. Used by
 * the checklist's `syncAutoStates` effect when crew/contract/logistics state
 * shifts cause multiple auto items to flip on the same render — sending a
 * single batch instead of N parallel toggleAdvancingItem calls (each doing
 * its own RMW) avoids both the round-trip count and the last-write-wins
 * race when two toggles land out of order.
 */
export async function setAdvancingItemsAutoState(
  eventId: string,
  changes: ReadonlyArray<{ itemId: string; done: boolean }>,
  userName: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(eventId).success) return false;
  if (changes.length === 0) return true;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;

  const { items, error } = await readChecklist(eventId, workspaceId);
  if (error) return false;

  const wantById = new Map<string, boolean>();
  for (const c of changes) wantById.set(c.itemId, c.done);
  const nowIso = new Date().toISOString();

  const next = items.map((it) => {
    const want = wantById.get(it.id);
    if (want === undefined || want === it.done) return it;
    return {
      ...it,
      done: want,
      done_by: want ? userName : null,
      done_at: want ? nowIso : null,
    };
  });

  const writeErr = await writeChecklist(eventId, workspaceId, next);
  return !writeErr;
}

export async function addAdvancingItem(
  eventId: string,
  label: string,
): Promise<AdvancingChecklistItem | null> {
  if (!uuidSchema.safeParse(eventId).success) return null;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const trimmed = label.trim().slice(0, 200);
  if (!trimmed) return null;

  const { items, error } = await readChecklist(eventId, workspaceId);
  if (error) return null;

  const maxSort = items.reduce((max, i) => Math.max(max, i.sort_order), -1);
  const newItem: AdvancingChecklistItem = {
    id: crypto.randomUUID(),
    label: trimmed,
    done: false,
    done_by: null,
    done_at: null,
    auto_key: null,
    sort_order: maxSort + 1,
  };

  items.push(newItem);
  const writeErr = await writeChecklist(eventId, workspaceId, items);
  return writeErr ? null : newItem;
}

export async function removeAdvancingItem(
  eventId: string,
  itemId: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(eventId).success) return false;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;

  const { items, error } = await readChecklist(eventId, workspaceId);
  if (error) return false;

  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return false;

  // Only allow removal of manual items (no auto_key)
  if (items[idx].auto_key) return false;

  items.splice(idx, 1);
  const writeErr = await writeChecklist(eventId, workspaceId, items);
  return !writeErr;
}
