'use server';

import 'server-only';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { CrewEquipmentDTO } from '@/entities/talent';

// =============================================================================
// Schemas
// =============================================================================

const CATEGORIES = ['audio', 'lighting', 'video', 'staging', 'power', 'misc'] as const;

const reviewCrewEquipmentSchema = z.object({
  crew_equipment_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).optional(),
});

const addCrewEquipmentSchema = z.object({
  entity_id: z.string().uuid(),
  category: z.enum(CATEGORIES),
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  catalog_item_id: z.string().uuid().optional(),
});

const removeCrewEquipmentSchema = z.object({
  crew_equipment_id: z.string().uuid(),
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Refresh the denormalized equipment snapshot on directory.entities.attributes.equipment.
 * Called after every add/remove mutation so the entity card stays in sync.
 */
async function refreshEquipmentSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
  workspaceId: string
): Promise<void> {
  // I4 fix: Only include approved items in the denormalized snapshot
  const { data: allEquipment } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('name, category')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'approved')
    .order('category')
    .order('name');

  await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: {
      equipment: (allEquipment ?? []).map((r: { name: string; category: string }) => ({
        name: r.name,
        category: r.category,
      })),
    },
  });
}

// =============================================================================
// addCrewEquipment
// =============================================================================

export type CrewEquipmentAddResult = { ok: true; id: string } | { ok: false; error: string };

export async function addCrewEquipment(
  input: unknown
): Promise<CrewEquipmentAddResult> {
  const parsed = addCrewEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  // I1 fix: Verify entity belongs to this workspace
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('id', parsed.data.entity_id)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!entity) return { ok: false, error: 'Entity not found in this workspace.' };

  // Check if workspace requires verification for new equipment
  const { data: ws } = await supabase
    .from('workspaces')
    .select('require_equipment_verification')
    .eq('id', workspaceId)
    .single();

  const verificationStatus = ws?.require_equipment_verification ? 'pending' : 'approved';

  const { data, error } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .insert({
      entity_id: parsed.data.entity_id,
      workspace_id: workspaceId,
      category: parsed.data.category,
      name: parsed.data.name.trim(),
      quantity: parsed.data.quantity ?? 1,
      notes: parsed.data.notes ?? null,
      catalog_item_id: parsed.data.catalog_item_id ?? null,
      verification_status: verificationStatus,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Equipment already added.' };
    return { ok: false, error: error.message };
  }

  await refreshEquipmentSnapshot(supabase, parsed.data.entity_id, workspaceId);

  return { ok: true, id: data.id };
}

// =============================================================================
// removeCrewEquipment
// =============================================================================

export type CrewEquipmentMutateResult = { ok: true } | { ok: false; error: string };

export async function removeCrewEquipment(
  input: unknown
): Promise<CrewEquipmentMutateResult> {
  const parsed = removeCrewEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  const { data: row } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('entity_id, workspace_id')
    .eq('id', parsed.data.crew_equipment_id)
    .single();

  if (!row) return { ok: false, error: 'Equipment not found.' };
  if (row.workspace_id !== workspaceId) return { ok: false, error: 'Not authorised.' };

  const { error } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .delete()
    .eq('id', parsed.data.crew_equipment_id);

  if (error) return { ok: false, error: error.message };

  await refreshEquipmentSnapshot(supabase, row.entity_id, workspaceId);

  return { ok: true };
}

// =============================================================================
// getCrewEquipmentForEntity
// =============================================================================

export async function getCrewEquipmentForEntity(entityId: string): Promise<CrewEquipmentDTO[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('id, category, name, quantity, notes, catalog_item_id, verification_status, photo_url')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .order('category')
    .order('name');

  return (data ?? []) as CrewEquipmentDTO[];
}

// =============================================================================
// getWorkspaceEquipmentVerificationRequired
// =============================================================================

export async function getWorkspaceEquipmentVerificationRequired(): Promise<boolean> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from('workspaces')
    .select('require_equipment_verification')
    .eq('id', workspaceId)
    .single();

  return data?.require_equipment_verification ?? false;
}

// =============================================================================
// toggleEquipmentVerification
// =============================================================================

export type ToggleVerificationResult = { ok: true; enabled: boolean } | { ok: false; error: string };

export async function toggleEquipmentVerification(
  enabled: boolean
): Promise<ToggleVerificationResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  // Permission check: owner or admin only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return { ok: false, error: 'Only workspace owners and admins can change this setting.' };
  }

  const { error } = await supabase
    .from('workspaces')
    .update({ require_equipment_verification: enabled })
    .eq('id', workspaceId);

  if (error) return { ok: false, error: error.message };

  // A5 fix: When disabling verification, bulk-approve all pending items
  if (!enabled) {
    await supabase.rpc('bulk_approve_pending_equipment', {
      p_workspace_id: workspaceId,
    });
  }

  return { ok: true, enabled };
}

// =============================================================================
// reviewCrewEquipment
// =============================================================================

export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function reviewCrewEquipment(
  input: unknown
): Promise<ReviewResult> {
  const parsed = reviewCrewEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();

  // Use SECURITY DEFINER RPC — handles permission check + verification column write protection
  const { error } = await supabase.rpc('review_crew_equipment', {
    p_crew_equipment_id: parsed.data.crew_equipment_id,
    p_decision: parsed.data.decision,
    p_rejection_reason: parsed.data.rejection_reason ?? null,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

// =============================================================================
// getPendingEquipmentForWorkspace
// =============================================================================

export type PendingEquipmentItem = {
  id: string;
  entity_id: string;
  entity_name: string;
  name: string;
  category: string;
  catalog_item_id: string | null;
  photo_url: string | null;
};

export async function getPendingEquipmentForWorkspace(): Promise<PendingEquipmentItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Fetch pending equipment
  const { data: equipment } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('id, entity_id, name, category, catalog_item_id, photo_url')
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });

  if (!equipment || equipment.length === 0) return [];

  // Fetch entity names for the unique entity IDs
  const entityIds = [...new Set(equipment.map((e) => e.entity_id))];
  const { data: entities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, name')
    .in('id', entityIds);

  const entityMap = new Map((entities ?? []).map((e) => [e.id, e.name ?? 'Unknown']));

  return equipment.map((e) => ({
    id: e.id,
    entity_id: e.entity_id,
    entity_name: entityMap.get(e.entity_id) ?? 'Unknown',
    name: e.name,
    category: e.category,
    catalog_item_id: e.catalog_item_id,
    photo_url: e.photo_url,
  }));
}

// =============================================================================
// uploadEquipmentPhoto
// =============================================================================

export type PhotoUploadResult = { ok: true; photoUrl: string } | { ok: false; error: string };

export async function uploadEquipmentPhoto(
  formData: FormData
): Promise<PhotoUploadResult> {
  const crewEquipmentId = formData.get('crew_equipment_id');
  const file = formData.get('file');

  if (typeof crewEquipmentId !== 'string' || !z.string().uuid().safeParse(crewEquipmentId).success) {
    return { ok: false, error: 'Invalid equipment ID.' };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: 'No file provided.' };
  }

  // Validate file type and size
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return { ok: false, error: 'Only PNG, JPEG, and WebP images are supported.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Image must be under 5 MB.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  // Verify the equipment belongs to this workspace and get entity_id
  const { data: equipment } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('id, entity_id, workspace_id')
    .eq('id', crewEquipmentId)
    .single();

  if (!equipment) return { ok: false, error: 'Equipment not found.' };
  if (equipment.workspace_id !== workspaceId) return { ok: false, error: 'Not authorised.' };

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${workspaceId}/entities/${equipment.entity_id}/equipment/${crewEquipmentId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('workspace-files')
    .upload(path, file, { cacheControl: '3600', upsert: true });

  if (uploadError) {
    console.error('[uploadEquipmentPhoto] upload failed:', uploadError.message);
    return { ok: false, error: 'Upload failed. Try again.' };
  }

  // Update the photo_url column
  const { error: updateError } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .update({ photo_url: path })
    .eq('id', crewEquipmentId);

  if (updateError) {
    console.error('[uploadEquipmentPhoto] DB update failed:', updateError.message);
    return { ok: false, error: 'Failed to save photo reference.' };
  }

  return { ok: true, photoUrl: path };
}
