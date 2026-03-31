'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type EntityCapabilityRow = {
  id: string;
  capability: string;
};

// =============================================================================
// getEntityCapabilities
// =============================================================================

export async function getEntityCapabilities(
  entityId: string,
): Promise<EntityCapabilityRow[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
   
  const { data } = await (supabase as any)
    .schema('ops')
    .from('entity_capabilities')
    .select('id, capability')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .order('capability');

  return (data ?? []) as EntityCapabilityRow[];
}

// =============================================================================
// addEntityCapability
// =============================================================================

const AddCapabilitySchema = z.object({
  entity_id: z.string().uuid(),
  capability: z.string().min(1).max(120),
});

export async function addEntityCapability(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = AddCapabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No workspace.' };

  const { entity_id, capability } = parsed.data;

  const supabase = await createClient();
   
  const { data, error } = await (supabase as any)
    .schema('ops')
    .from('entity_capabilities')
    .insert({
      entity_id,
      workspace_id: workspaceId,
      capability: capability.trim(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Capability already assigned.' };
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data as { id: string }).id };
}

// =============================================================================
// removeEntityCapability
// =============================================================================

const RemoveCapabilitySchema = z.object({
  capability_id: z.string().uuid(),
});

export async function removeEntityCapability(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = RemoveCapabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid ID.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No workspace.' };

  const supabase = await createClient();

  // Verify the row belongs to the caller's workspace before deleting
   
  const { data: row } = await (supabase as any)
    .schema('ops')
    .from('entity_capabilities')
    .select('workspace_id')
    .eq('id', parsed.data.capability_id)
    .maybeSingle();

  if (!row) return { ok: false, error: 'Not found.' };
  if ((row as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: 'Not authorised.' };
  }

   
  const { error } = await (supabase as any)
    .schema('ops')
    .from('entity_capabilities')
    .delete()
    .eq('id', parsed.data.capability_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// listWorkspaceCapabilityPresets
// =============================================================================

export async function listWorkspaceCapabilityPresets(): Promise<string[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
   
  const { data } = await (supabase as any)
    .schema('ops')
    .from('workspace_capability_presets')
    .select('capability')
    .eq('workspace_id', workspaceId)
    .order('sort_order');

  return (data ?? []).map((r: { capability: string }) => r.capability);
}

// =============================================================================
// addWorkspaceCapabilityPreset
// =============================================================================

const AddPresetSchema = z.object({
  capability: z.string().min(1).max(120),
});

export async function addWorkspaceCapabilityPreset(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = AddPresetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No workspace.' };

  const supabase = await createClient();
   
  const { data, error } = await (supabase as any)
    .schema('ops')
    .from('workspace_capability_presets')
    .insert({
      workspace_id: workspaceId,
      capability: parsed.data.capability.trim(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Preset already exists.' };
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data as { id: string }).id };
}

// =============================================================================
// removeWorkspaceCapabilityPreset
// =============================================================================

const RemovePresetSchema = z.object({
  preset_id: z.string().uuid(),
});

export async function removeWorkspaceCapabilityPreset(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = RemovePresetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid ID.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No workspace.' };

  const supabase = await createClient();
   
  const { error, count } = await (supabase as any)
    .schema('ops')
    .from('workspace_capability_presets')
    .delete({ count: 'exact' })
    .eq('id', parsed.data.preset_id)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: 'Not found.' };
  return { ok: true };
}
