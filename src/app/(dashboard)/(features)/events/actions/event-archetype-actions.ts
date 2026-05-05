'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';
import type { EventArchetypeRow, EventArchetypeUpsertResult } from '@/shared/lib/event-archetype';

type DbRow = {
  id: string;
  workspace_id: string | null;
  slug: string;
  label: string;
  is_system: boolean;
  archived_at: string | null;
};

function toRow(row: DbRow): EventArchetypeRow {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    slug: row.slug,
    label: row.label,
    is_system: row.is_system,
    archived_at: row.archived_at,
  };
}

// Module-level cache (Phase 1, load-time-strategy.md §3.3 invalidation matrix).
// Event archetypes are workspace-immutable from the user's session perspective;
// they only change via Settings → Event types. Mirrors get-workspace-pipeline-
// stages and lead-source-actions: 5-min TTL Map keyed by workspace_id.
// Mutations below explicitly invalidate so settings edits show immediately.
type ArchetypeCachedEntry = {
  data: EventArchetypeRow[];
  expiresAt: number;
};
const ARCHETYPE_CACHE = new Map<string, ArchetypeCachedEntry>();
const ARCHETYPE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function invalidateWorkspaceEventArchetypeCache(
  workspaceId: string,
): Promise<void> {
  ARCHETYPE_CACHE.delete(workspaceId);
}

async function fetchWorkspaceEventArchetypesUncached(
  workspaceId: string,
): Promise<EventArchetypeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('workspace_event_archetypes')
    .select('id, workspace_id, slug, label, is_system, archived_at')
    .or(`is_system.eq.true,workspace_id.eq.${workspaceId}`)
    .is('archived_at', null)
    .order('is_system', { ascending: false })
    .order('label', { ascending: true });
  if (error) {
    console.error('[crm] listWorkspaceEventArchetypes error:', error.message);
    return [];
  }
  return ((data ?? []) as DbRow[]).map(toRow);
}

/**
 * List active event archetypes for a workspace: system rows + the workspace's
 * own custom rows, omitting archived. Sorted: system first (alpha), then
 * custom (alpha). Callers render into the EventTypeCombobox dropdown.
 */
export async function listWorkspaceEventArchetypes(
  workspaceIdOverride?: string,
): Promise<EventArchetypeRow[]> {
  const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
  if (!workspaceId) return [];

  const now = Date.now();
  const cached = ARCHETYPE_CACHE.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await fetchWorkspaceEventArchetypesUncached(workspaceId);
  ARCHETYPE_CACHE.set(workspaceId, {
    data,
    expiresAt: now + ARCHETYPE_CACHE_TTL_MS,
  });
  return data;
}

/**
 * Idempotent create-or-return by normalized slug. Server-authoritative —
 * two members racing to create 'Pool Party' converge on the same row. When
 * the typed label normalizes to a system slug, returns the system row.
 */
export async function upsertWorkspaceEventArchetype(
  label: string,
): Promise<{ success: true; row: EventArchetypeUpsertResult } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .rpc('upsert_workspace_event_archetype', {
      p_workspace_id: workspaceId,
      p_label: label,
    });
  if (error) {
    return { success: false, error: error.message };
  }
  const row = data as EventArchetypeUpsertResult;
  await invalidateWorkspaceEventArchetypeCache(workspaceId);
  revalidatePath('/settings/event-types');
  return { success: true, row };
}

/**
 * Archive a CUSTOM archetype. System rows cannot be archived (hardcoded guard
 * in the RPC). Archived rows drop out of pickers but stay attached to
 * historical deals.
 */
export async function archiveWorkspaceEventArchetype(
  slug: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };
  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .rpc('archive_workspace_event_archetype', {
      p_workspace_id: workspaceId,
      p_slug: slug,
    });
  if (error) return { success: false, error: error.message };
  await invalidateWorkspaceEventArchetypeCache(workspaceId);
  revalidatePath('/settings/event-types');
  return { success: true };
}

export async function unarchiveWorkspaceEventArchetype(
  slug: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };
  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .rpc('unarchive_workspace_event_archetype', {
      p_workspace_id: workspaceId,
      p_slug: slug,
    });
  if (error) return { success: false, error: error.message };
  await invalidateWorkspaceEventArchetypeCache(workspaceId);
  revalidatePath('/settings/event-types');
  return { success: true };
}

export async function renameWorkspaceEventArchetype(
  slug: string,
  newLabel: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };
  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .rpc('rename_workspace_event_archetype', {
      p_workspace_id: workspaceId,
      p_slug: slug,
      p_new_label: newLabel,
    });
  if (error) return { success: false, error: error.message };
  await invalidateWorkspaceEventArchetypeCache(workspaceId);
  revalidatePath('/settings/event-types');
  return { success: true };
}

/**
 * Merge a custom slug into a target (system OR custom). Moves all
 * public.deals + ops.events rows from source to target, then archives
 * source. Admin-only. Irreversible from the UI; owners can unarchive the
 * source row afterward but it won't rehydrate the moved deals.
 */
export async function mergeWorkspaceEventArchetypes(
  sourceSlug: string,
  targetSlug: string,
): Promise<
  | { success: true; movedDeals: number }
  | { success: false; error: string }
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .rpc('merge_workspace_event_archetypes', {
      p_workspace_id: workspaceId,
      p_source_slug: sourceSlug,
      p_target_slug: targetSlug,
    });
  if (error) return { success: false, error: error.message };
  const result = data as { moved_deals?: number } | null;
  await invalidateWorkspaceEventArchetypeCache(workspaceId);
  revalidatePath('/settings/event-types');
  revalidatePath('/events');
  return { success: true, movedDeals: result?.moved_deals ?? 0 };
}

/**
 * Build a slug→label map for rendering event_archetype on stream cards and
 * other surfaces. Falls back to humanized slug when the row is missing
 * (archived types referenced by legacy deals still get a readable label).
 */
export async function getWorkspaceEventArchetypeLabelMap(
  workspaceIdOverride?: string,
): Promise<Record<string, string>> {
  const workspaceId = workspaceIdOverride ?? (await getActiveWorkspaceId());
  if (!workspaceId) return {};
  const supabase = await createClient();
  // Include archived rows here — a stream card for a deal that still
  // references an archived slug deserves the real label, not a humanized
  // fallback.
  const { data } = await supabase
    .schema('ops')
    .from('workspace_event_archetypes')
    .select('slug, label, is_system')
    .or(`is_system.eq.true,workspace_id.eq.${workspaceId}`);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ slug: string; label: string }>) {
    out[row.slug] = row.label;
  }
  return out;
}
