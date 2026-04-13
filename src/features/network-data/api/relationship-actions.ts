/**
 * Network Orbit – Relationship state changes: pin/unpin, notes, meta, soft delete/restore.
 * @module features/network-data/api/relationship-actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentEntityAndOrg, orgTypeToCortex } from './network-helpers';

// ---------------------------------------------------------------------------
// Pin / Unpin (Inner Circle)
// ---------------------------------------------------------------------------

/**
 * Pin a relationship to the Inner Circle (tier = 'preferred').
 * Session 9: handles cortex relationship IDs (primary) with legacy org_relationships fallback.
 */
export async function pinToInnerCircle(
  relationshipId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

  // Try cortex path first (relationshipId is cortex.relationships.id)
  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId).maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: cortexRel.relationship_type,
      p_context_data: { ...existingCtx, tier: 'preferred', deleted_at: null },
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

/**
 * Unpin (Anti-Gravity): Downgrade a relationship from 'preferred' (Inner Circle) to 'standard' (Outer Orbit).
 */
export async function unpinFromInnerCircle(
  relationshipId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

  // Try cortex path first
  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId).maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: cortexRel.relationship_type,
      p_context_data: { ...existingCtx, tier: 'standard' },
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

// ---------------------------------------------------------------------------
// Notes & Meta
// ---------------------------------------------------------------------------

/**
 * Update private notes for a relationship (Glass Slide-Over auto-save).
 * Session 9: cortex-first, with legacy org_relationships fallback.
 */
export async function updateRelationshipNotes(
  relationshipId: string,
  notes: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId).maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: cortexRel.relationship_type,
      p_context_data: { ...existingCtx, notes: notes ?? null },
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

export type RelationshipType = 'vendor' | 'venue' | 'client_company' | 'partner';
export type LifecycleStatus = 'prospect' | 'active' | 'dormant' | 'blacklisted';

/**
 * Update relationship metadata: type, tier, tags, lifecycle_status, blacklist_reason.
 * Session 9: cortex-first, with legacy org_relationships fallback.
 */
export async function updateRelationshipMeta(
  relationshipId: string,
  sourceOrgId: string,
  payload: {
    type?: RelationshipType | null;
    tier?: string | null;
    tags?: string[] | null;
    lifecycleStatus?: LifecycleStatus | null;
    blacklistReason?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId).maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const ctxPatch: Record<string, unknown> = { ...existingCtx };
    if (payload.tier !== undefined) ctxPatch.tier = payload.tier ?? 'standard';
    if (payload.tags !== undefined) ctxPatch.tags = payload.tags ?? null;
    if (payload.lifecycleStatus !== undefined) ctxPatch.lifecycle_status = payload.lifecycleStatus;
    if (payload.blacklistReason !== undefined) ctxPatch.blacklist_reason = payload.blacklistReason;

    let relType = cortexRel.relationship_type;
    if (payload.type !== undefined && payload.type) relType = orgTypeToCortex(payload.type);

    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: relType,
      p_context_data: ctxPatch,
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

// ---------------------------------------------------------------------------
// Soft Delete / Restore
// ---------------------------------------------------------------------------

const DELETED_RETENTION_DAYS = 30;

/**
 * Soft-delete a ghost/partner connection. Hidden from stream; can be restored within DELETED_RETENTION_DAYS.
 */
export async function softDeleteGhostRelationship(
  relationshipId: string,
  sourceOrgId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  // Cortex-first: store deleted_at in context_data
  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId)
    .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER'])
    .maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: cortexRel.relationship_type,
      p_context_data: { ...existingCtx, deleted_at: new Date().toISOString() },
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

/**
 * Restore a soft-deleted connection. Only within retention window.
 */
export async function restoreGhostRelationship(
  relationshipId: string,
  sourceOrgId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  // Cortex-first: clear deleted_at from context_data
  const { data: cortexRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId)
    .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER'])
    .maybeSingle();

  if (cortexRel) {
    const existingCtx = (cortexRel.context_data as Record<string, unknown>) ?? {};
    const { deleted_at: _removed, ...rest } = existingCtx;
    const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: cortexRel.source_entity_id,
      p_target_entity_id: cortexRel.target_entity_id,
      p_type: cortexRel.relationship_type,
      p_context_data: rest,
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    revalidatePath('/network');
    return { ok: true };
  }

  return { ok: false, error: 'Relationship not found.' };
}

export type DeletedRelationship = {
  id: string;
  targetOrgId: string;
  targetName: string;
  deletedAt: string;
  canRestore: boolean;
};

/**
 * List soft-deleted relationships for the current org (for "Recently deleted" / Restore UI).
 * Only returns rows where deleted_at is within the retention window.
 */
export async function getDeletedRelationships(sourceOrgId: string): Promise<DeletedRelationship[]> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DELETED_RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  // Cortex-first: find rels where context_data.deleted_at is within retention window
  const { data: srcDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();

  if (srcDirEnt?.id) {
    const { data: cortexRels } = await supabase
      .schema('cortex').from('relationships')
      .select('id, target_entity_id, context_data')
      .eq('source_entity_id', srcDirEnt.id)
      .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);

    const deletedCortex = (cortexRels ?? []).filter((r) => {
      const ctx = (r.context_data as Record<string, unknown>) ?? {};
      const deletedAt = ctx.deleted_at as string | null;
      return deletedAt && deletedAt >= cutoffIso;
    });

    if (deletedCortex.length > 0) {
      const targetEntityIds = [...new Set(deletedCortex.map((r) => r.target_entity_id))];
      const { data: targetEnts } = await supabase
        .schema('directory').from('entities')
        .select('id, display_name, legacy_org_id').in('id', targetEntityIds);
      const nameById = new Map((targetEnts ?? []).map((e) => [e.id, e.display_name ?? 'Unknown']));
      const orgIdById = new Map(
        (targetEnts ?? []).filter((e) => e.legacy_org_id).map((e) => [e.id, e.legacy_org_id!])
      );

      return deletedCortex.map((r) => {
        const ctx = (r.context_data as Record<string, unknown>) ?? {};
        return {
          id: r.id,
          targetOrgId: orgIdById.get(r.target_entity_id) ?? r.target_entity_id,
          targetName: nameById.get(r.target_entity_id) ?? 'Unknown',
          deletedAt: ctx.deleted_at as string,
          canRestore: true,
        };
      });
    }
  }

  return [];
}
