/**
 * Network Orbit – Server Actions: getNetworkStream, pinToInnerCircle, summonPartner.
 * @module features/network-data/api/actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { unstable_noStore } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { NetworkNode } from '@/entities/network';
import { createGhostOrg } from '@/entities/organization';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2, restricted: 3 };

/** HQ org resolution: must match features/network/api/actions (org_members, not affiliations). */
const ORG_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  member: 3,
  restricted: 4,
};

/** Maps public.org_relationships.type to cortex relationship_type. */
function orgTypeToCortex(type: string): string {
  switch (type) {
    case 'vendor':         return 'VENDOR';
    case 'venue':          return 'VENUE_PARTNER';
    case 'client_company': return 'CLIENT';
    case 'client':         return 'CLIENT';
    case 'partner':        return 'PARTNER';
    default:               return type.toUpperCase();
  }
}

/**
 * Dual-write helper: syncs a single org_relationship row to cortex.relationships.
 * Fetches the current state of the row, looks up directory entities, calls upsert_relationship RPC.
 * Non-fatal — cortex sync failure does not block the primary write.
 */
async function syncOrgRelToCortex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  relationshipId: string
): Promise<void> {
  try {
    const { data: rel } = await supabase
      .from('org_relationships')
      .select('source_org_id, target_org_id, type, tier, notes, tags, lifecycle_status, blacklist_reason, deleted_at')
      .eq('id', relationshipId)
      .maybeSingle();
    if (!rel) return;

    const [sourceRes, targetRes] = await Promise.all([
      supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', rel.source_org_id).maybeSingle(),
      supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', rel.target_org_id).maybeSingle(),
    ]);
    if (!sourceRes.data?.id || !targetRes.data?.id) return;

    const row = rel as Record<string, unknown>;
    await supabase.rpc('upsert_relationship', {
      p_source_entity_id: sourceRes.data.id,
      p_target_entity_id: targetRes.data.id,
      p_type: orgTypeToCortex(String(row.type)),
      p_context_data: {
        tier:                      row.tier,
        notes:                     row.notes,
        tags:                      row.tags,
        lifecycle_status:          row.lifecycle_status,
        blacklist_reason:          row.blacklist_reason,
        deleted_at:                row.deleted_at,
        legacy_org_relationship_id: relationshipId,
      },
    });
  } catch {
    // Non-fatal: cortex sync is best-effort during the dual-write transition phase.
  }
}

/**
 * Resolve current user's entity id and HQ org via directory.entities + cortex.relationships.
 * Session 9: migrated from public.entities + public.org_members.
 * Returns: entityId = directory.entities.id, orgId = legacy_org_id UUID.
 */
async function getCurrentEntityAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { entityId: null, orgId: null };

  const { data: personEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!personEnt) return { entityId: null, orgId: null };

  const { data: rels } = await supabase
    .schema('cortex').from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', personEnt.id)
    .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
    .limit(5);

  if (rels?.length) {
    const sorted = [...rels].sort((a, b) => {
      const ra = (a.context_data as Record<string, unknown>)?.role as string ?? '';
      const rb = (b.context_data as Record<string, unknown>)?.role as string ?? '';
      return (ORG_ROLE_PRIORITY[ra] ?? 99) - (ORG_ROLE_PRIORITY[rb] ?? 99);
    });
    const { data: orgEnt } = await supabase
      .schema('directory').from('entities')
      .select('legacy_org_id').eq('id', sorted[0].target_entity_id).maybeSingle();
    return { entityId: personEnt.id, orgId: orgEnt?.legacy_org_id ?? null };
  }

  return { entityId: personEnt.id, orgId: null };
}

/**
 * Fetch the unified Network Orbit stream: Core (employees) + Inner Circle (preferred partners).
 * Session 9: reads from cortex.relationships + directory.entities.
 */
export async function getNetworkStream(orgId: string): Promise<NetworkNode[]> {
  const supabase = await createClient();
  const { entityId, orgId: resolvedOrgId } = await getCurrentEntityAndOrg(supabase);
  if (!entityId) return [];

  // Get org directory entity
  const { data: orgDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', orgId).maybeSingle();
  if (!orgDirEnt) return [];

  // Verify caller is a member of the requested org (cortex check)
  const { data: callerMembership } = await supabase
    .schema('cortex').from('relationships')
    .select('id').eq('source_entity_id', entityId).eq('target_entity_id', orgDirEnt.id)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']).maybeSingle();

  if (!callerMembership && resolvedOrgId !== orgId) return [];

  // Fetch all ROSTER_MEMBER edges (team) and preferred partner edges (inner circle) in parallel
  const [rosterRes, partnerRes] = await Promise.all([
    supabase.schema('cortex').from('relationships')
      .select('id, source_entity_id, context_data')
      .eq('target_entity_id', orgDirEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER'),
    supabase.schema('cortex').from('relationships')
      .select('id, target_entity_id, relationship_type, context_data')
      .eq('source_entity_id', orgDirEnt.id)
      .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT', 'VENUE_PARTNER']),
  ]);

  const rosterEdges = rosterRes.data ?? [];
  const allPartnerEdges = partnerRes.data ?? [];
  const innerCircleEdges = allPartnerEdges.filter((r) => {
    const ctx = (r.context_data as Record<string, unknown>) ?? {};
    return ctx.tier === 'preferred' && !ctx.deleted_at;
  });

  // Fetch person entities and partner org entities
  const personEntityIds = [...new Set(rosterEdges.map((e) => e.source_entity_id))];
  const partnerEntityIds = [...new Set(innerCircleEdges.map((e) => e.target_entity_id))];

  const [personEntRes, partnerEntRes] = await Promise.all([
    personEntityIds.length > 0
      ? supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, attributes')
          .in('id', personEntityIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null; attributes: unknown }[] },
    partnerEntityIds.length > 0
      ? supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, legacy_org_id')
          .in('id', partnerEntityIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null; legacy_org_id: string | null }[] },
  ]);

  const personMap = new Map((personEntRes.data ?? []).map((p) => [p.id, p]));
  const partnerMap = new Map((partnerEntRes.data ?? []).map((p) => [p.id, p]));

  const coreNodes: NetworkNode[] = rosterEdges.map((edge): NetworkNode => {
    const ctx = (edge.context_data as Record<string, unknown>) ?? {};
    const person = personMap.get(edge.source_entity_id);
    const attrs = (person?.attributes as Record<string, unknown>) ?? {};
    const email = (attrs.email as string | null) ?? null;
    const name =
      [(ctx.first_name as string) ?? '', (ctx.last_name as string) ?? ''].filter(Boolean).join(' ') ||
      person?.display_name || email || 'Unknown';
    const avatarUrl = person?.avatar_url ?? null;
    const role = (ctx.role as string) ?? 'member';
    const jobTitle = (ctx.job_title as string | null) ?? null;
    return {
      id: edge.id,
      entityId: edge.source_entity_id,
      kind: 'internal_employee',
      gravity: 'core',
      identity: { name, avatarUrl, label: jobTitle || role || 'Member' },
      meta: { email: email ?? undefined, tags: [] },
    };
  }).sort((a, b) => {
    const orderA = ROLE_ORDER[a.identity.label] ?? 99;
    const orderB = ROLE_ORDER[b.identity.label] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.identity.name.localeCompare(b.identity.name);
  });

  function cortexTypeToLabel(type: string): string {
    switch (type) {
      case 'VENDOR': return 'Vendor';
      case 'VENUE_PARTNER': return 'Venue';
      case 'CLIENT': return 'Client';
      default: return 'Partner';
    }
  }

  const innerCircleNodes: NetworkNode[] = innerCircleEdges.map((edge): NetworkNode => {
    const partner = partnerMap.get(edge.target_entity_id);
    const ctx = (edge.context_data as Record<string, unknown>) ?? {};
    const legacyOrgId = (partner?.legacy_org_id as string | null) ?? edge.target_entity_id;
    return {
      id: edge.id,
      entityId: legacyOrgId,
      kind: 'external_partner',
      gravity: 'inner_circle',
      identity: {
        name: partner?.display_name ?? 'Unknown',
        avatarUrl: null,
        label: cortexTypeToLabel(edge.relationship_type),
      },
      meta: { tags: (ctx.tags as string[] | null) ?? [] },
    };
  }).sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  return [...coreNodes, ...innerCircleNodes];
}

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

  // Legacy fallback: org_relationships
  const { error } = await supabase
    .from('org_relationships')
    .update({ tier: 'preferred' })
    .eq('id', relationshipId)
    .eq('source_org_id', orgId);
  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
}

/**
 * Unpin (Anti-Gravity): Downgrade a relationship from 'preferred' (Inner Circle) to 'standard' (Outer Orbit).
 * Session 9: handles cortex relationship IDs with legacy org_relationships fallback.
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

  // Legacy fallback: org_relationships
  const { error } = await supabase
    .from('org_relationships')
    .update({ tier: 'standard' })
    .eq('id', relationshipId)
    .eq('source_org_id', orgId);
  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
}

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

export type CreateGhostWithContactPayload = {
  type: 'organization' | 'person';
  name: string;
  contactName?: string;
  email?: string;
  website?: string;
};

/**
 * Ghost Forge: create ghost org + optional primary contact, link to sourceOrg, return relationship id and org id.
 * Used when user opens the Forge sheet from OmniSearch and submits; then redirect to /network?nodeId=&kind=external_partner.
 * Also used from Deal Room to create a client and auto-link the deal (organizationId returned for linkDealToClient).
 */
export async function createGhostWithContact(
  sourceOrgId: string,
  payload: CreateGhostWithContactPayload
): Promise<
  | { success: true; relationshipId: string; organizationId: string; mainContactId?: string | null }
  | { success: false; error: string }
> {
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

  const nameTrim = payload.name.trim();
  if (!nameTrim) return { success: false, error: 'Name is required.' };

  const orgName = payload.type === 'person' ? `${nameTrim} (Personal)` : nameTrim;
  const ghost = await createGhostOrg({
    workspace_id: workspaceId,
    name: orgName,
    city: '—',
    type: 'partner',
    created_by_org_id: sourceOrgId,
  });
  if (!ghost.ok) return { success: false, error: ghost.error };

  const websiteTrim = payload.website?.trim();
  if (websiteTrim) {
    // ghost.id is directory.entities.id (Session 9: createGhostOrg writes only to directory)
    const { data: ghostDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('attributes').eq('id', ghost.id).maybeSingle();
    if (ghostDirEnt) {
      const existingAttrs = (ghostDirEnt.attributes as Record<string, unknown>) ?? {};
      await supabase.schema('directory').from('entities')
        .update({ attributes: { ...existingAttrs, website: websiteTrim } })
        .eq('id', ghost.id);
    }
  }

  let mainContactId: string | null = null;
  const contactName = payload.type === 'organization' ? payload.contactName?.trim() : nameTrim;
  const emailTrim = payload.email?.trim() ?? null;
  if (contactName || emailTrim) {
    const parts = (contactName || nameTrim || 'Contact').split(/\s+/);
    const firstName = parts[0] ?? 'Contact';
    const lastName = parts.slice(1).join(' ') || '';
    const { data: rpcData, error: rpcError } = await supabase.rpc('add_contact_to_ghost_org', {
      p_ghost_org_id: ghost.id,
      p_workspace_id: workspaceId,
      p_creator_org_id: sourceOrgId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: emailTrim || null,
    });
    if (rpcError) {
      return { success: false, error: rpcError.message };
    }
    if (rpcData && typeof rpcData === 'string') mainContactId = rpcData;
  }

  const result = await summonPartner(sourceOrgId, ghost.id, 'partner');
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

  const name = (data.name ?? data.website ?? 'From ION').trim() || 'From ION';
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

export type NetworkSearchOrg = {
  id: string;
  name: string;
  logo_url?: string | null;
  is_ghost?: boolean;
  /** 'connection' = already in your rolodex; 'global' = public Signal directory. */
  _source?: 'connection' | 'global';
};

/**
 * Search two universes for OmniSearch: Your connections first, then global public directory.
 * Prevents creating duplicate ghosts (e.g. "Acme Catering" already in rolodex).
 * RLS: user must belong to sourceOrg.
 */
export async function searchNetworkOrgs(
  sourceOrgId: string,
  query: string
): Promise<NetworkSearchOrg[]> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return [];

  const q = query.trim();
  if (q.length < 1) return [];

  // Prefer directory.entities for workspace lookup
  const { data: srcEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  let workspaceId: string | null = srcEntity?.owner_workspace_id ?? null;
  let connectionResults: NetworkSearchOrg[] = [];
  let connectionIds: string[] = [];

  if (srcEntity?.id && workspaceId) {
    // CORTEX PATH: get my active connection target entity IDs
    const { data: cortexRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id, context_data')
      .eq('source_entity_id', srcEntity.id)
      .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);

    const activeTargetIds = (cortexRels ?? [])
      .filter((r) => !(r.context_data as Record<string, unknown>)?.deleted_at)
      .map((r) => r.target_entity_id);

    if (activeTargetIds.length > 0) {
      const { data: targetEntities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, avatar_url, attributes, legacy_org_id')
        .in('id', activeTargetIds)
        .ilike('display_name', `%${q}%`)
        .limit(10);

      connectionResults = (targetEntities ?? []).map((e) => {
        const attrs = (e.attributes as Record<string, unknown>) ?? {};
        const legacyId = (e.legacy_org_id as string | null) ?? e.id;
        return {
          id: legacyId,
          name: e.display_name,
          logo_url: (e.avatar_url as string | null) ?? null,
          is_ghost: (attrs.is_ghost as boolean) ?? false,
          _source: 'connection' as const,
        };
      });
    }
    connectionIds = connectionResults.map((r) => r.id);
  } else {
    // LEGACY FALLBACK: org_relationships + organizations
    if (!workspaceId) {
      const { data: sourceOrg } = await supabase
        .from('organizations')
        .select('workspace_id')
        .eq('id', sourceOrgId)
        .single();
      workspaceId = sourceOrg?.workspace_id ?? null;
    }
    if (workspaceId) {
      const { data: rels } = await supabase
        .from('org_relationships')
        .select('target_org_id')
        .eq('source_org_id', sourceOrgId)
        .is('deleted_at', null);
      const myTargetIds = (rels ?? []).map((r) => r.target_org_id).filter(Boolean);
      if (myTargetIds.length > 0) {
        const { data: connectionOrgs } = await supabase
          .from('organizations')
          .select('id, name, logo_url, is_ghost')
          .in('id', myTargetIds)
          .ilike('name', `%${q}%`)
          .limit(10);
        connectionResults = (connectionOrgs ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          logo_url: (r as { logo_url?: string | null }).logo_url ?? null,
          is_ghost: (r as { is_ghost?: boolean }).is_ghost ?? false,
          _source: 'connection' as const,
        }));
      }
      connectionIds = connectionResults.map((r) => r.id);
    }
  }

  if (!workspaceId) return connectionResults;

  const excludeSet = new Set([sourceOrgId, ...connectionIds]);

  // 2. GLOBAL DIRECTORY — preferred: directory.entities; fallback: organizations
  let globalResults: NetworkSearchOrg[] = [];
  const { data: globalEntities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url, attributes, legacy_org_id')
    .eq('owner_workspace_id', workspaceId)
    .ilike('display_name', `%${q}%`)
    .limit(15);

  if (globalEntities?.length) {
    const globalFiltered = globalEntities
      .filter((e) => {
        const attrs = (e.attributes as Record<string, unknown>) ?? {};
        const isGhost = (attrs.is_ghost as boolean) ?? false;
        const eid = (e.legacy_org_id as string | null) ?? e.id;
        return !isGhost && !excludeSet.has(eid);
      })
      .slice(0, 10);
    globalResults = globalFiltered.map((e) => {
      const attrs = (e.attributes as Record<string, unknown>) ?? {};
      const eid = (e.legacy_org_id as string | null) ?? e.id;
      return {
        id: eid,
        name: e.display_name,
        logo_url: (e.avatar_url as string | null) ?? null,
        is_ghost: (attrs.is_ghost as boolean) ?? false,
        _source: 'global' as const,
      };
    });
  } else {
    // Fallback: organizations table
    const { data: globalRows } = await supabase
      .from('organizations')
      .select('id, name, logo_url, is_ghost')
      .eq('workspace_id', workspaceId)
      .eq('is_ghost', false)
      .neq('id', sourceOrgId)
      .ilike('name', `%${q}%`)
      .limit(15);
    const globalFiltered = (globalRows ?? []).filter((r) => !excludeSet.has(r.id)).slice(0, 10);
    globalResults = globalFiltered.map((r) => ({
      id: r.id,
      name: r.name,
      logo_url: (r as { logo_url?: string | null }).logo_url ?? null,
      is_ghost: (r as { is_ghost?: boolean }).is_ghost ?? false,
      _source: 'global' as const,
    }));
  }

  return [...connectionResults, ...globalResults];
}

// ---------------------------------------------------------------------------
// Network Detail (Glass Slide-Over)
// ---------------------------------------------------------------------------

export type NodeDetailCrewMember = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
};

export type NodeDetail = {
  id: string;
  kind: 'internal_employee' | 'external_partner';
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    email?: string;
  };
  /** Relationship direction for partners: vendor (money out), client (money in), partner (both). */
  direction: 'vendor' | 'client' | 'partner' | null;
  balance: { inbound: number; outbound: number };
  active_events: string[];
  /** Only for external_partner: org_relationships.notes. */
  notes: string | null;
  /** For external_partner: relationship id for updating notes. */
  relationshipId: string | null;
  /** For external_partner: target org is unclaimed (ghost). Enables "Summon" UI. */
  isGhost: boolean;
  /** For external_partner: target org id (for summon). */
  targetOrgId: string | null;
  /** For external_partner: org display (Liquid Identity banner). */
  orgSlug?: string | null;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  orgWebsite?: string | null;
  /** For external_partner: roster of target org (Crew tab). */
  crew?: NodeDetailCrewMember[];
  // Extended profile (ghost org + relationship)
  orgSupportEmail?: string | null;
  orgAddress?: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  orgDefaultCurrency?: string | null;
  orgCategory?: string | null;
  /** operational_settings: tax_id, payment_terms, entity_type, doing_business_as, phone */
  orgOperationalSettings?: Record<string, unknown> | null;
  relationshipTier?: string | null;
  relationshipTags?: string[] | null;
  lifecycleStatus?: 'prospect' | 'active' | 'dormant' | 'blacklisted' | null;
  blacklistReason?: string | null;
  /** For internal_employee: org_members.role (owner | admin | member | restricted). */
  memberRole?: 'owner' | 'admin' | 'member' | 'restricted' | null;
  /** For internal_employee: whether current user can assign admin/manager (owner or admin). */
  canAssignElevatedRole?: boolean;
};

/**
 * Fetch deep context for a Network node (employee or partner) for the Glass Slide-Over.
 * Scoped to current user's org. Balance/events mocked if finance tables not linked.
 * Uses unstable_noStore so crew list is always fresh after adding a member (no cached placeholder).
 */
export async function getNetworkNodeDetails(
  nodeId: string,
  kind: 'internal_employee' | 'external_partner',
  sourceOrgId: string
): Promise<NodeDetail | null> {
  unstable_noStore();
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return null;

  if (kind === 'internal_employee') {
    // Cortex-first: nodeId is cortex.relationships.id (ROSTER_MEMBER edge)
    const { data: cortexRel } = await supabase
      .schema('cortex').from('relationships')
      .select('id, source_entity_id, target_entity_id, context_data')
      .eq('id', nodeId).eq('relationship_type', 'ROSTER_MEMBER').maybeSingle();

    if (cortexRel) {
      const ctx = (cortexRel.context_data as Record<string, unknown>) ?? {};
      const { data: personEnt } = await supabase
        .schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes')
        .eq('id', cortexRel.source_entity_id).maybeSingle();
      const attrs = (personEnt?.attributes as Record<string, unknown>) ?? {};
      const email = (attrs.email as string | null) ?? null;
      const firstName = (ctx.first_name as string | null) ?? null;
      const lastName = (ctx.last_name as string | null) ?? null;
      const name = [firstName, lastName].filter(Boolean).join(' ') || personEnt?.display_name || email || 'Unknown';
      const role = (ctx.role as 'owner' | 'admin' | 'member' | 'restricted' | null) ?? null;

      // Check caller's permission via cortex
      const { entityId } = await getCurrentEntityAndOrg(supabase);
      let canAssignElevatedRole = false;
      if (entityId) {
        const { data: callerRel } = await supabase
          .schema('cortex').from('relationships')
          .select('context_data').eq('source_entity_id', entityId)
          .eq('target_entity_id', cortexRel.target_entity_id)
          .eq('relationship_type', 'ROSTER_MEMBER').maybeSingle();
        const callerCtx = (callerRel?.context_data as Record<string, unknown>) ?? {};
        const callerRole = (callerCtx.role as string | null) ?? null;
        canAssignElevatedRole = callerRole === 'owner' || callerRole === 'admin';
      }

      return {
        id: cortexRel.id,
        kind: 'internal_employee',
        identity: {
          name,
          avatarUrl: personEnt?.avatar_url ?? null,
          label: (ctx.job_title as string | null) ?? role ?? 'Member',
          email: email ?? undefined,
        },
        direction: null,
        balance: { inbound: 0, outbound: 0 },
        active_events: [],
        notes: null,
        relationshipId: null,
        isGhost: false,
        targetOrgId: null,
        memberRole: role ?? null,
        canAssignElevatedRole,
      };
    }

    // Legacy fallback
    const { data: member, error: memberError } = await supabase
      .from('org_members')
      .select('id, entity_id, job_title, first_name, last_name, role')
      .eq('id', nodeId)
      .eq('org_id', sourceOrgId)
      .maybeSingle();
    if (memberError || !member?.entity_id) return null;

    const { data: avatarRow } = await supabase
      .from('org_members')
      .select('avatar_url')
      .eq('id', nodeId)
      .eq('org_id', sourceOrgId)
      .maybeSingle();
    const legacyAvatarUrl = (avatarRow as { avatar_url?: string | null } | null)?.avatar_url ?? null;

    const { data: entity } = await supabase
      .from('entities')
      .select('id, email')
      .eq('id', member.entity_id)
      .single();
    const legacyName =
      [member.first_name, member.last_name].filter(Boolean).join(' ') || entity?.email || 'Unknown';
    const legacyRole = member.role as 'owner' | 'admin' | 'member' | 'restricted' | null;

    return {
      id: member.id,
      kind: 'internal_employee',
      identity: {
        name: legacyName,
        avatarUrl: legacyAvatarUrl,
        label: member.job_title || member.role || 'Member',
        email: entity?.email,
      },
      direction: null,
      balance: { inbound: 0, outbound: 0 },
      active_events: [],
      notes: null,
      relationshipId: null,
      isGhost: false,
      targetOrgId: null,
      memberRole: legacyRole ?? null,
      canAssignElevatedRole: false,
    };
  }

  // external_partner — cortex-first
  const { data: cortexExtRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', nodeId)
    .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER'])
    .maybeSingle();

  let relId: string;
  let targetEntityIdForCrew: string | null = null;
  let targetOrgIdLegacy: string | null = null;
  let relNotes: string | null;
  let relTier: string | null;
  let relTags: string[] | null;
  let relLifecycleStatus: NodeDetail['lifecycleStatus'];
  let relBlacklistReason: string | null;
  let relType: string;
  let orgEntity: { id: string; display_name: string; handle: string | null; avatar_url: string | null; attributes: unknown } | null = null;

  if (cortexExtRel) {
    const ctx = (cortexExtRel.context_data as Record<string, unknown>) ?? {};
    if (ctx.deleted_at) return null;
    relId = cortexExtRel.id;
    targetEntityIdForCrew = cortexExtRel.target_entity_id;
    relNotes = (ctx.notes as string | null) ?? null;
    relTier = (ctx.tier as string | null) ?? null;
    relTags = (ctx.tags as string[] | null) ?? null;
    relLifecycleStatus = (ctx.lifecycle_status as NodeDetail['lifecycleStatus']) ?? null;
    relBlacklistReason = (ctx.blacklist_reason as string | null) ?? null;
    // Map cortex type back to display label
    relType = cortexExtRel.relationship_type
      .toLowerCase()
      .replace('venue_partner', 'venue')
      .replace('_', ' ');

    const { data: orgEnt } = await supabase
      .schema('directory').from('entities')
      .select('id, display_name, handle, avatar_url, attributes, legacy_org_id')
      .eq('id', cortexExtRel.target_entity_id).maybeSingle();
    if (!orgEnt) return null;
    orgEntity = orgEnt;
    targetOrgIdLegacy = orgEnt.legacy_org_id ?? orgEnt.id;
  } else {
    // Legacy fallback: org_relationships
    const { data: rel, error: relError } = await supabase
      .from('org_relationships')
      .select('id, target_org_id, type, notes, tier, tags, lifecycle_status, blacklist_reason, deleted_at')
      .eq('id', nodeId)
      .eq('source_org_id', sourceOrgId)
      .maybeSingle();
    if (relError || !rel) return null;
    const relWithDeleted = rel as { deleted_at?: string | null };
    if (relWithDeleted.deleted_at) return null;

    const relRow = rel as { lifecycle_status?: string | null; blacklist_reason?: string | null; tier?: string | null; tags?: string[] | null };
    relId = rel.id;
    relNotes = rel.notes ?? null;
    relTier = relRow.tier ?? null;
    relTags = relRow.tags ?? null;
    relLifecycleStatus = relRow.lifecycle_status as NodeDetail['lifecycleStatus'];
    relBlacklistReason = relRow.blacklist_reason ?? null;
    relType = String(rel.type);
    targetOrgIdLegacy = rel.target_org_id;

    const { data: orgEnt } = await supabase
      .schema('directory').from('entities')
      .select('id, display_name, handle, avatar_url, attributes, legacy_org_id')
      .eq('legacy_org_id', rel.target_org_id).maybeSingle();
    orgEntity = orgEnt ?? null;
    targetEntityIdForCrew = orgEnt?.id ?? null;
  }

  const orgAttrs = (orgEntity?.attributes as Record<string, unknown>) ?? {};
  const isGhost = (orgAttrs.is_ghost as boolean) ?? false;
  const typeLabel =
    relType === 'vendor'
      ? 'Vendor'
      : relType === 'venue'
        ? 'Venue'
        : relType === 'client' || relType === 'client_company' || relType === 'client'
          ? 'Client'
          : 'Partner';
  const direction: NodeDetail['direction'] =
    relType === 'vendor'
      ? 'vendor'
      : relType === 'client' || relType === 'client_company'
        ? 'client'
        : 'partner';

  // Crew: cortex-first (ROSTER_MEMBER edges on target org)
  let crew: NodeDetail['crew'] = [];
  const sys = getSystemClient();

  if (targetEntityIdForCrew) {
    const { data: crewRels } = await sys
      .schema('cortex').from('relationships')
      .select('id, source_entity_id, context_data')
      .eq('target_entity_id', targetEntityIdForCrew)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .limit(500);

    if (crewRels?.length) {
      const personEntIds = [...new Set(crewRels.map((r) => r.source_entity_id))];
      const { data: personEnts } = await sys
        .schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes')
        .in('id', personEntIds);
      const personEntMap = new Map((personEnts ?? []).map((e) => [e.id, e]));

      crew = crewRels.map((r) => {
        const ctx = (r.context_data as Record<string, unknown>) ?? {};
        const personEnt = personEntMap.get(r.source_entity_id);
        const attrs = (personEnt?.attributes as Record<string, unknown>) ?? {};
        const firstName = (ctx.first_name as string | null) ?? null;
        const lastName = (ctx.last_name as string | null) ?? null;
        const name =
          [firstName, lastName].filter(Boolean).join(' ') ||
          personEnt?.display_name ||
          (attrs.email as string | null) ||
          'Contact';
        return {
          id: r.id,
          name,
          email: (attrs.email as string | null) ?? null,
          role: (ctx.role as string | null) ?? null,
          jobTitle: (ctx.job_title as string | null) ?? null,
          avatarUrl: personEnt?.avatar_url ?? null,
          phone: (attrs.phone as string | null) ?? null,
        };
      });
    } else if (targetOrgIdLegacy) {
      // Legacy crew fallback: org_members + affiliations + entities
      const [membersRes, affsRes] = await Promise.all([
        sys
          .from('org_members')
          .select('id, entity_id, first_name, last_name, role, job_title, avatar_url, phone')
          .eq('org_id', targetOrgIdLegacy)
          .limit(500),
        sys
          .from('affiliations')
          .select('entity_id')
          .eq('organization_id', targetOrgIdLegacy)
          .eq('status', 'active')
          .limit(500),
      ]);
      const members = membersRes.data ?? [];
      const affEntityIds = new Set(
        (affsRes.data ?? []).map((a) => (a as { entity_id: string }).entity_id).filter(Boolean)
      );
      members.forEach((m) => { if (m.entity_id) affEntityIds.add(m.entity_id); });
      const entityIds = [...affEntityIds];
      if (entityIds.length > 0) {
        const { data: entities } = await sys.from('entities').select('id, email').in('id', entityIds);
        const entityMap = new Map((entities ?? []).map((e) => [e.id, e]));
        const memberByEntity = new Map(
          (members as { entity_id: string | null; id: string; first_name: string | null; last_name: string | null; role?: string | null; job_title?: string | null; avatar_url?: string | null; phone?: string | null }[])
            .filter((m) => m.entity_id != null)
            .map((m) => [m.entity_id!, {
              id: m.id, first_name: m.first_name, last_name: m.last_name,
              role: m.role ?? null, job_title: m.job_title ?? null,
              avatar_url: m.avatar_url ?? null, phone: m.phone ?? null,
            }])
        );
        crew = entityIds.map((entity_id) => {
          const m = memberByEntity.get(entity_id);
          const e = entityMap.get(entity_id);
          const rawName = (m && [m.first_name, m.last_name].filter(Boolean).join(' ').trim()) || e?.email || null;
          return {
            id: m?.id ?? entity_id,
            name: rawName?.trim() || 'Contact',
            email: e?.email ?? null,
            role: m?.role ?? null,
            jobTitle: m?.job_title ?? null,
            avatarUrl: m?.avatar_url ?? null,
            phone: m?.phone ?? null,
          };
        });
      }
    }
  }

  return {
    id: relId,
    kind: 'external_partner',
    identity: {
      name: orgEntity?.display_name ?? 'Unknown',
      avatarUrl: orgEntity?.avatar_url ?? null,
      label: typeLabel,
    },
    direction,
    balance: { inbound: 0, outbound: 0 },
    active_events: [],
    notes: relNotes,
    relationshipId: relId,
    isGhost,
    targetOrgId: targetOrgIdLegacy,
    orgSlug: orgEntity?.handle ?? null,
    orgLogoUrl: orgEntity?.avatar_url ?? null,
    orgBrandColor: (orgAttrs.brand_color as string | null) ?? null,
    orgWebsite: (orgAttrs.website as string | null) ?? null,
    crew,
    orgSupportEmail: (orgAttrs.support_email as string | null) ?? null,
    orgAddress: (orgAttrs.address as NodeDetail['orgAddress']) ?? null,
    orgDefaultCurrency: (orgAttrs.default_currency as string | null) ?? null,
    orgCategory: (orgAttrs.category as string | null) ?? null,
    orgOperationalSettings: (orgAttrs.operational_settings as Record<string, unknown> | null) ?? null,
    relationshipTier: relTier,
    relationshipTags: relTags,
    lifecycleStatus: relLifecycleStatus ?? null,
    blacklistReason: relBlacklistReason,
  };
}

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

  // Legacy fallback
  const { error } = await supabase
    .from('org_relationships')
    .update({ notes: notes ?? null })
    .eq('id', relationshipId)
    .eq('source_org_id', orgId);
  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
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

  // Legacy fallback
  const toUpdate: Record<string, unknown> = {};
  if (payload.type !== undefined) toUpdate.type = payload.type;
  if (payload.tier !== undefined) toUpdate.tier = payload.tier ?? 'standard';
  if (payload.tags !== undefined) toUpdate.tags = payload.tags ?? null;
  if (payload.lifecycleStatus !== undefined) toUpdate.lifecycle_status = payload.lifecycleStatus;
  if (payload.blacklistReason !== undefined) toUpdate.blacklist_reason = payload.blacklistReason;

  if (Object.keys(toUpdate).length === 0) return { ok: true };

  const { error } = await supabase
    .from('org_relationships')
    .update(toUpdate)
    .eq('id', relationshipId)
    .eq('source_org_id', sourceOrgId);
  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
}

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

  // Legacy fallback
  const { error } = await supabase
    .from('org_relationships')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', relationshipId)
    .eq('source_org_id', sourceOrgId);

  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
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

  // Legacy fallback
  const { error } = await supabase
    .from('org_relationships')
    .update({ deleted_at: null })
    .eq('id', relationshipId)
    .eq('source_org_id', sourceOrgId);

  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, relationshipId);
  revalidatePath('/network');
  return { ok: true };
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

  // Legacy fallback: org_relationships
  const { data: rels } = await supabase
    .from('org_relationships')
    .select('id, target_org_id, deleted_at')
    .eq('source_org_id', sourceOrgId)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', cutoffIso);

  if (!rels?.length) return [];
  const targetIds = [...new Set(rels.map((r) => r.target_org_id))];
  const { data: orgEntities } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name, legacy_org_id')
    .in('legacy_org_id', targetIds);
  const nameByOrg = new Map(
    (orgEntities ?? [])
      .filter((e) => e.legacy_org_id)
      .map((e) => [e.legacy_org_id!, e.display_name ?? 'Unknown'])
  );

  return rels.map((r) => ({
    id: r.id,
    targetOrgId: r.target_org_id,
    targetName: nameByOrg.get(r.target_org_id) ?? 'Unknown',
    deletedAt: (r as { deleted_at: string }).deleted_at,
    canRestore: true,
  }));
}

/**
 * Update a ghost org member (role, job_title, avatar_url, phone). Creator org only.
 */
export async function updateGhostMember(
  sourceOrgId: string,
  memberId: string,
  payload: { role?: string | null; jobTitle?: string | null; avatarUrl?: string | null; phone?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  const { data: result, error } = await supabase.rpc('update_ghost_member', {
    p_creator_org_id: sourceOrgId,
    p_member_id: memberId,
    p_role: payload.role ?? null,
    p_job_title: payload.jobTitle ?? null,
    p_avatar_url: payload.avatarUrl ?? null,
    p_phone: payload.phone ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const res = result as { ok?: boolean; error?: string } | null;
  if (res && res.ok === false && res.error) return { ok: false, error: res.error };
  revalidatePath('/network');
  return { ok: true };
}

/**
 * Add a contact (ghost entity + org_member) to a ghost org. Only the org that created the ghost may add.
 * Used by Node Detail Sheet → Crew tab "Add contact".
 * Inserts entity + org_member directly so the creator can add crew without being a member of the ghost org
 * (add_ghost_member RPC requires membership in the target org and blocks ghost connections).
 */
export async function addContactToGhostOrg(
  sourceOrgId: string,
  ghostOrgId: string,
  payload: { firstName: string; lastName: string; email?: string | null; role?: string | null; jobTitle?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  // Session 9: look up ghost org in directory.entities only (legacy organizations fallback removed)
  const { data: ghostOrgDir } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id, attributes')
    .or(`legacy_org_id.eq.${ghostOrgId},id.eq.${ghostOrgId}`)
    .maybeSingle();

  if (!ghostOrgDir?.owner_workspace_id) return { ok: false, error: 'Partner org not found.' };
  const ghostWorkspaceId = ghostOrgDir.owner_workspace_id;
  const attrs = (ghostOrgDir.attributes as Record<string, unknown>) ?? {};
  const createdByOrgId = (attrs.created_by_org_id as string | null) ?? null;
  if (createdByOrgId !== sourceOrgId) return { ok: false, error: 'Only the org that created this partner can add crew.' };

  const firstName = (payload.firstName ?? '').trim() || 'Contact';
  const lastName = (payload.lastName ?? '').trim() ?? '';
  const emailVal =
    (payload.email ? String(payload.email).trim() : '') ||
    `ghost-${crypto.randomUUID()}@signal.local`;
  const role = (payload.role ? String(payload.role).trim() : null) ?? 'member';
  const jobTitle = payload.jobTitle ? String(payload.jobTitle).trim() || null : null;

  // Use add_contact_to_ghost_org RPC (already migrated to directory + cortex)
  const { error: rpcErr } = await supabase.rpc('add_contact_to_ghost_org', {
    p_ghost_org_id: ghostOrgId,
    p_workspace_id: ghostWorkspaceId,
    p_creator_org_id: sourceOrgId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: emailVal,
    p_role: role,
    p_job_title: jobTitle,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message ?? 'Failed to add to crew.' };

  revalidatePath('/network');
  return { ok: true };
}

/** Batch-add Scout roster to ghost org via add_contact_to_ghost_org RPC. */
export async function addScoutRosterToGhostOrg(
  sourceOrgId: string,
  ghostOrgId: string,
  roster: Array<{ firstName: string; lastName: string; jobTitle?: string | null; avatarUrl?: string | null; email?: string | null }>
): Promise<{ ok: boolean; addedCount: number; error?: string }> {
  if (!roster?.length) return { ok: true, addedCount: 0 };
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Unauthorized.' };

  // Session 9: look up ghost org in directory.entities only
  const { data: ghostOrgDir2 } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id, attributes')
    .or(`legacy_org_id.eq.${ghostOrgId},id.eq.${ghostOrgId}`)
    .maybeSingle();
  if (!ghostOrgDir2?.owner_workspace_id) return { ok: false, addedCount: 0, error: 'Partner org not found.' };
  const ghostWorkspaceId2 = ghostOrgDir2.owner_workspace_id;
  const attrs2 = (ghostOrgDir2.attributes as Record<string, unknown>) ?? {};
  const createdByOrgId2 = (attrs2.created_by_org_id as string | null) ?? null;
  if (createdByOrgId2 !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Only the org that created this partner can add crew.' };

  let addedCount = 0;
  let firstError: string | null = null;

  for (const m of roster) {
    const firstName = (m.firstName ?? '').trim() || 'Contact';
    const lastName = (m.lastName ?? '').trim() ?? '';
    const emailRaw = m.email && typeof m.email === 'string' ? m.email.trim() : '';
    const emailVal = emailRaw || `ghost-${crypto.randomUUID()}@signal.local`;
    const jobTitle = m.jobTitle && typeof m.jobTitle === 'string' ? m.jobTitle.trim() || null : null;

    const { error: rpcErr } = await supabase.rpc('add_contact_to_ghost_org', {
      p_ghost_org_id: ghostOrgId,
      p_workspace_id: ghostWorkspaceId2,
      p_creator_org_id: sourceOrgId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: emailVal,
      p_role: 'member',
      p_job_title: jobTitle,
    });

    if (rpcErr) {
      if (!firstError) firstError = rpcErr.message ?? 'Failed to add to crew';
      continue;
    }
    addedCount += 1;
  }

  revalidatePath('/network');
  if (firstError && addedCount === 0) {
    return { ok: false, addedCount: 0, error: firstError };
  }
  return { ok: true, addedCount };
}

export type UpdateOrgMemberRoleResult = { ok: true } | { ok: false; error: string };

const ORG_MEMBER_ROLES = ['owner', 'admin', 'member', 'restricted'] as const;
type OrgMemberRoleDb = (typeof ORG_MEMBER_ROLES)[number];

/**
 * Update an internal team member's role. Only owner/admin can change roles.
 * Owner can assign any role; admin cannot assign owner. Maps manager -> member for DB.
 */
/**
 * Update an internal team member's role via cortex.relationships context_data.
 * Session 9: reads from directory.entities + cortex.relationships.
 * orgMemberId is a cortex.relationships.id.
 */
export async function updateOrgMemberRole(
  orgMemberId: string,
  sourceOrgId: string,
  newRole: 'owner' | 'admin' | 'manager' | 'member' | 'restricted'
): Promise<UpdateOrgMemberRoleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Get caller's directory entity + their org role
  const { data: callerEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!callerEnt) return { ok: false, error: 'Account not linked.' };

  const { data: orgDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();
  if (!orgDirEnt) return { ok: false, error: 'Organization not found.' };

  const { data: callerRel } = await supabase
    .schema('cortex').from('relationships')
    .select('context_data')
    .eq('source_entity_id', callerEnt.id)
    .eq('target_entity_id', orgDirEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  const callerCtx = (callerRel?.context_data as Record<string, unknown>) ?? {};
  const currentRole = (callerCtx.role as OrgMemberRoleDb | null) ?? null;

  if (!currentRole || !['owner', 'admin'].includes(currentRole)) {
    return { ok: false, error: 'Only owners and admins can change roles.' };
  }
  if (newRole === 'owner' && currentRole !== 'owner') {
    return { ok: false, error: 'Only the owner can assign the owner role.' };
  }

  const dbRole: OrgMemberRoleDb = newRole === 'manager' ? 'member' : newRole;

  // Look up target member's cortex relationship
  const { data: targetRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', orgMemberId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  if (!targetRel) return { ok: false, error: 'Member not found.' };

  const existingCtx = (targetRel.context_data as Record<string, unknown>) ?? {};
  const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: targetRel.source_entity_id,
    p_target_entity_id: targetRel.target_entity_id,
    p_type: targetRel.relationship_type,
    p_context_data: { ...existingCtx, role: dbRole },
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/network');
  revalidatePath('/settings/team');
  return { ok: true };
}
