/**
 * Network Orbit – Ghost creation and connection actions.
 * @module features/network-data/api/ghost-actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { createGhostOrg } from '@/entities/organization';
import { getCurrentEntityAndOrg, orgTypeToCortex } from './network-helpers';
import { addScoutRosterToGhostOrg } from './member-actions';

// ---------------------------------------------------------------------------
// summonPartner / summonPartnerAsGhost / summonPersonGhost
// ---------------------------------------------------------------------------

/**
 * Add or promote a partner: create or update a cortex.relationship with tier 'preferred'.
 * Session 9: writes to cortex.relationships via upsert_relationship RPC.
 * targetOrgId may be a legacy org UUID or a directory.entities.id (ghost orgs created after Session 9).
 */
export async function summonPartner(
  sourceOrgId: string,
  targetOrgId: string,
  type: 'vendor' | 'venue' | 'client' | 'partner' = 'partner'
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Not authorized.' };

  // Resolve source directory entity
  const { data: srcDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();
  if (!srcDirEnt) return { ok: false, error: 'Source organization not found.' };

  // Resolve target directory entity (legacy UUID first, then direct entity ID)
  let targetDirEntId: string | null = null;
  const { data: targetByLegacy } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', targetOrgId).maybeSingle();
  if (targetByLegacy) {
    targetDirEntId = targetByLegacy.id;
  } else {
    const { data: targetById } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('id', targetOrgId).maybeSingle();
    targetDirEntId = targetById?.id ?? null;
  }
  if (!targetDirEntId) return { ok: false, error: 'Target organization not found.' };

  const cortexType = orgTypeToCortex(type);
  const { data: relId, error: rpcErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: srcDirEnt.id,
    p_target_entity_id: targetDirEntId,
    p_type: cortexType,
    p_context_data: { tier: 'preferred', lifecycle_status: 'active', deleted_at: null },
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/network');
  return { ok: true, id: relId as string };
}

/**
 * Create a Ghost organization by name and connect it to sourceOrg (Inner Circle).
 * Used by OmniSearch when user chooses "Initialize Ghost" for a name not found.
 */
export async function summonPartnerAsGhost(
  sourceOrgId: string,
  name: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Not authorized.' };

  const { data: srcEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  const workspaceId = srcEntity?.owner_workspace_id ?? null;
  if (!workspaceId) return { ok: false, error: 'Organization not found.' };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name is required.' };

  const ghost = await createGhostOrg({
    workspace_id: workspaceId,
    name: trimmed,
    city: '—',
    type: 'partner',
    created_by_org_id: sourceOrgId,
  });
  if (!ghost.ok) return { ok: false, error: ghost.error };

  return summonPartner(sourceOrgId, ghost.id, 'partner');
}

/**
 * Create a Ghost person entity by name and connect it to sourceOrg as a preferred partner.
 * Used by OmniSearch when the user wants to add an individual freelancer (not a company).
 * Creates: directory person entity (ghost) + PARTNER edge with tier='preferred'.
 */
export async function summonPersonGhost(
  sourceOrgId: string,
  name: string,
): Promise<{ ok: true; entityId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Not authorized.' };

  const { data: srcDirEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  if (!srcDirEnt) return { ok: false, error: 'Organization not found.' };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name is required.' };

  // Split display name into first/last best-effort
  const parts = trimmed.split(/\s+/);
  const first_name = parts[0] ?? trimmed;
  const last_name = parts.slice(1).join(' ') || null;

  // Create ghost person entity
  const { data: ghostEnt, error: entErr } = await supabase
    .schema('directory')
    .from('entities')
    .insert({
      display_name: trimmed,
      type: 'person',
      claimed_by_user_id: null,
      owner_workspace_id: srcDirEnt.owner_workspace_id,
      attributes: { is_ghost: true, first_name, last_name },
    })
    .select('id')
    .single();
  if (entErr || !ghostEnt) return { ok: false, error: entErr?.message ?? 'Failed to create profile.' };

  // Create PARTNER edge from org → person with tier='preferred' (inner circle)
  const { error: relErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: srcDirEnt.id,
    p_target_entity_id: ghostEnt.id,
    p_type: 'PARTNER',
    p_context_data: { tier: 'preferred', lifecycle_status: 'active', deleted_at: null },
  });
  if (relErr) return { ok: false, error: relErr.message };

  revalidatePath('/network');
  return { ok: true, entityId: ghostEnt.id };
}

// ---------------------------------------------------------------------------
// createGhostWithContact / createConnectionFromScout
// ---------------------------------------------------------------------------

export type CreateGhostWithContactPayload = {
  type: 'organization' | 'person';
  name: string;
  contactName?: string;
  email?: string;
  website?: string;
  // Person-specific
  phone?: string;
  market?: string;
  unionStatus?: string;
  // Organization-specific
  relationshipType?: 'vendor' | 'venue' | 'client' | 'partner';
  w9Status?: boolean;
  coiExpiry?: string;
  paymentTerms?: string;
  // Venue-specific
  dockAddress?: string;
  venuePmName?: string;
  venuePmPhone?: string;
};

/**
 * Create a Ghost org/person and optional main contact, then connect to sourceOrg.
 * Used by GhostForgeSheet (Add connection sheet).
 */
export async function createGhostWithContact(
  sourceOrgId: string,
  payload: CreateGhostWithContactPayload
): Promise<{
  success: boolean;
  error?: string;
  relationshipId?: string;
  organizationId?: string;
  mainContactId?: string;
}> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { success: false, error: 'Unauthorized.' };

  if (payload.type === 'person') {
    const result = await summonPersonGhost(sourceOrgId, payload.name);
    if (!result.ok) return { success: false, error: result.error };
    // Update person attributes if provided
    if (payload.email || payload.phone || payload.market || payload.unionStatus) {
      const attrs: Record<string, unknown> = {};
      if (payload.email) attrs.email = payload.email;
      if (payload.phone) attrs.phone = payload.phone;
      if (payload.market) attrs.market = payload.market;
      if (payload.unionStatus) attrs.union_status = payload.unionStatus;
      await supabase.rpc('patch_entity_attributes', {
        p_entity_id: result.entityId,
        p_attributes: attrs,
      });
    }
    return { success: true, relationshipId: result.entityId, organizationId: result.entityId };
  }

  // Organization flow
  const { data: srcEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  const workspaceId = srcEntity?.owner_workspace_id ?? null;
  if (!workspaceId) return { success: false, error: 'Organization not found.' };

  const ghost = await createGhostOrg({
    workspace_id: workspaceId,
    name: payload.name.trim() || 'New Partner',
    city: '—',
    type: payload.relationshipType === 'client' ? 'client_company' : (payload.relationshipType ?? 'partner'),
    created_by_org_id: sourceOrgId,
  });
  if (!ghost.ok) return { success: false, error: ghost.error };

  // Update ghost org profile if we have website/email
  if (payload.website || payload.email) {
    const profileAttrs: Record<string, unknown> = {};
    if (payload.website) profileAttrs.website = payload.website;
    if (payload.email) profileAttrs.support_email = payload.email;
    await supabase.rpc('patch_entity_attributes', {
      p_entity_id: ghost.id,
      p_attributes: profileAttrs,
    });
  }

  // Create optional main contact
  let mainContactId: string | null = null;
  if (payload.contactName) {
    const parts = payload.contactName.trim().split(/\s+/);
    const firstName = parts[0] ?? payload.contactName;
    const lastName = parts.slice(1).join(' ') || '';
    const contactEmail = payload.email ?? `ghost-${crypto.randomUUID()}@unusonic.local`;

    const { data: rpcData, error: rpcError } = await supabase.rpc('add_contact_to_ghost_org', {
      p_ghost_org_id: ghost.id,
      p_workspace_id: workspaceId,
      p_creator_org_id: sourceOrgId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: contactEmail,
      p_role: 'member',
      p_job_title: null,
    });
    if (rpcError) {
      return { success: false, error: rpcError.message };
    }
    if (rpcData && typeof rpcData === 'string') mainContactId = rpcData;
  }

  const cortexType: 'vendor' | 'venue' | 'client' | 'partner' =
    payload.type === 'organization' && payload.relationshipType
      ? payload.relationshipType
      : 'partner';
  const result = await summonPartner(sourceOrgId, ghost.id, cortexType);
  if (!result.ok) return { success: false, error: result.error };
  return {
    success: true,
    relationshipId: result.id,
    organizationId: ghost.id,
    mainContactId: mainContactId ?? undefined,
  };
}

/** Scout result shape used when creating a connection from Scout (avoids importing full intelligence in actions). */
export type ScoutResultForCreate = {
  name?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  supportEmail?: string | null;
  phone?: string | null;
  address?: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  doingBusinessAs?: string | null;
  roster?: Array<{ firstName: string; lastName: string; jobTitle?: string | null; avatarUrl?: string | null; email?: string | null }> | null;
};

/**
 * Create a connection from Scout result: ghost org + relationship + profile + roster.
 * Used when user adds a partner via Scout in the Add connection sheet.
 */
export async function createConnectionFromScout(
  sourceOrgId: string,
  data: ScoutResultForCreate
): Promise<{ success: true; relationshipId: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { success: false, error: 'Not authorized.' };

  const { data: srcEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  const workspaceId = srcEntity?.owner_workspace_id ?? null;
  if (!workspaceId) return { success: false, error: 'Organization not found.' };

  const name = (data.name ?? data.website ?? 'From Aion').trim() || 'From Aion';
  const ghost = await createGhostOrg({
    workspace_id: workspaceId,
    name,
    city: '—',
    type: 'partner',
    created_by_org_id: sourceOrgId,
  });
  if (!ghost.ok) return { success: false, error: ghost.error };

  const linkResult = await summonPartner(sourceOrgId, ghost.id, 'partner');
  if (!linkResult.ok) return { success: false, error: linkResult.error };

  const { updateGhostProfile } = await import('@/features/network-data/api/update-ghost');
  const profilePayload = {
    name,
    website: data.website ?? null,
    logoUrl: data.logoUrl ?? null,
    supportEmail: data.supportEmail ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    doingBusinessAs: data.doingBusinessAs ?? null,
    category: 'coordinator' as const,
  };
  const profileResult = await updateGhostProfile(ghost.id, profilePayload);
  if (profileResult.error) {
    return { success: false, error: profileResult.error };
  }

  if (data.roster?.length) {
    const rosterResult = await addScoutRosterToGhostOrg(sourceOrgId, ghost.id, data.roster);
    if (rosterResult.error && rosterResult.addedCount === 0) {
      return { success: false, error: rosterResult.error };
    }
  }

  revalidatePath('/network');
  return { success: true, relationshipId: linkResult.id };
}
