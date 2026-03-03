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
 * Resolve current user's entity id and HQ org (org_members, role priority: owner → admin → member).
 * Must match features/network/api/actions so getCurrentOrgId() and getNetworkStream use the same org.
 */
async function getCurrentEntityAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { entityId: null, orgId: null };

  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!entity) return { entityId: null, orgId: null };

  const { data: members } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('entity_id', entity.id);

  if (members?.length) {
    const sorted = [...members].sort(
      (a, b) => (ORG_ROLE_PRIORITY[a.role] ?? 99) - (ORG_ROLE_PRIORITY[b.role] ?? 99)
    );
    return { entityId: entity.id, orgId: sorted[0].org_id };
  }

  const { data: owned } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', entity.id)
    .limit(1)
    .maybeSingle();
  if (owned?.id) return { entityId: entity.id, orgId: owned.id };

  return { entityId: entity.id, orgId: null };
}

/**
 * Fetch the unified Network Orbit stream: Core (employees) + Inner Circle (preferred partners).
 * Only returns data if the current user belongs to orgId (RLS + explicit check).
 * Authorize when: (1) resolved HQ org matches orgId, or (2) user is a member of orgId via org_members (e.g. org switcher/cookie).
 */
export async function getNetworkStream(orgId: string): Promise<NetworkNode[]> {
  const supabase = await createClient();
  const { entityId, orgId: resolvedOrgId } = await getCurrentEntityAndOrg(supabase);

  const isMemberOfRequestedOrg =
    entityId != null &&
    (await supabase
      .from('org_members')
      .select('org_id')
      .eq('org_id', orgId)
      .eq('entity_id', entityId)
      .maybeSingle()).data != null;

  const allowed = resolvedOrgId === orgId || isMemberOfRequestedOrg;

  if (!allowed) return [];

  const [membersResult, relsResult] = await Promise.all([
    supabase
      .from('org_members')
      .select('id, entity_id, job_title, first_name, last_name, role')
      .eq('org_id', orgId),
    supabase
      .from('org_relationships')
      .select('id, target_org_id, type')
      .eq('source_org_id', orgId)
      .eq('tier', 'preferred')
      .is('deleted_at', null),
  ]);

  const members = membersResult.data ?? [];
  const rels = relsResult.data ?? [];

  const entityIds = [...new Set(members.map((m) => m.entity_id).filter(Boolean))] as string[];
  const targetOrgIds = [...new Set(rels.map((r) => r.target_org_id))];

  const [entityRows, dirPersonRows, orgEntityRows, legacyOrgRows] = await Promise.all([
    entityIds.length > 0
      ? supabase.from('entities').select('id, email').in('id', entityIds)
      : { data: [] as { id: string; email: string }[] },
    entityIds.length > 0
      ? supabase.schema('directory').from('entities').select('display_name, legacy_entity_id').in('legacy_entity_id', entityIds)
      : { data: [] as { display_name: string; legacy_entity_id: string | null }[] },
    targetOrgIds.length > 0
      ? supabase.schema('directory').from('entities').select('display_name, legacy_org_id').in('legacy_org_id', targetOrgIds)
      : { data: [] as { display_name: string; legacy_org_id: string | null }[] },
    targetOrgIds.length > 0
      ? supabase.from('organizations').select('id, name').in('id', targetOrgIds)
      : { data: [] as { id: string; name: string }[] },
  ]);

  const entityMap = new Map((entityRows.data ?? []).map((e) => [e.id, e]));
  const dirPersonNameByLegacyId = new Map(
    (dirPersonRows.data ?? [])
      .filter((e) => e.legacy_entity_id != null)
      .map((e) => [e.legacy_entity_id!, e.display_name ?? ''])
  );
  const orgMap = new Map(
    (orgEntityRows.data ?? [])
      .filter((e) => e.legacy_org_id)
      .map((e) => [e.legacy_org_id!, { id: e.legacy_org_id!, name: e.display_name }])
  );
  for (const o of legacyOrgRows.data ?? []) {
    if (!orgMap.has(o.id)) orgMap.set(o.id, { id: o.id, name: o.name });
  }

  const { data: avatarRows } = await supabase
    .from('org_members')
    .select('id, avatar_url')
    .eq('org_id', orgId);
  const avatarByMemberId = new Map<string, string | null>();
  if (avatarRows) {
    for (const row of avatarRows as { id: string; avatar_url?: string | null }[]) {
      avatarByMemberId.set(row.id, row.avatar_url ?? null);
    }
  }

  const coreNodes: NetworkNode[] = members
    .filter((m) => m.entity_id)
    .map((m): NetworkNode => {
      const e = entityMap.get(m.entity_id!);
      const dirName = dirPersonNameByLegacyId.get(m.entity_id!);
      const name =
        [m.first_name, m.last_name].filter(Boolean).join(' ') ||
        e?.email ||
        (dirName?.trim() ? dirName : null) ||
        'Unknown';
      const avatarUrl = avatarByMemberId.get(m.id) ?? null;
      return {
        id: m.id,
        entityId: m.entity_id!,
        kind: 'internal_employee' as const,
        gravity: 'core',
        identity: {
          name,
          avatarUrl: avatarUrl || null,
          label: m.job_title || m.role || 'Member',
        },
        meta: {
          email: e?.email,
          tags: [],
        },
      };
    })
    .sort((a, b) => {
      const orderA = ROLE_ORDER[a.identity.label] ?? 99;
      const orderB = ROLE_ORDER[b.identity.label] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.identity.name.localeCompare(b.identity.name);
    });

  const innerCircleNodes: NetworkNode[] = rels
    .map((r): NetworkNode => {
      const org = orgMap.get(r.target_org_id);
      const typeLabel =
        r.type === 'vendor'
          ? 'Vendor'
          : r.type === 'venue'
            ? 'Venue'
            : r.type === 'client'
              ? 'Client'
              : 'Partner';
      return {
        id: r.id,
        entityId: r.target_org_id,
        kind: 'external_partner' as const,
        gravity: 'inner_circle',
        identity: {
          name: org?.name ?? 'Unknown',
          avatarUrl: null,
          label: typeLabel,
        },
        meta: { tags: [] },
      };
    })
    .sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  return [...coreNodes, ...innerCircleNodes];
}

/**
 * Pin a relationship to the Inner Circle (tier = 'preferred').
 */
export async function pinToInnerCircle(
  relationshipId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

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
 * The card will visually "dissolve" from the view after revalidation.
 */
export async function unpinFromInnerCircle(
  relationshipId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

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
 * Add or promote a partner: create relationship with tier 'preferred' or update existing to 'preferred'.
 * Used by OmniSearch when user selects a target org.
 */
export async function summonPartner(
  sourceOrgId: string,
  targetOrgId: string,
  type: 'vendor' | 'venue' | 'client' | 'partner' = 'partner'
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

  const { data: existing } = await supabase
    .from('org_relationships')
    .select('id')
    .eq('source_org_id', sourceOrgId)
    .eq('target_org_id', targetOrgId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('org_relationships')
      .update({ tier: 'preferred', deleted_at: null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    await syncOrgRelToCortex(supabase, existing.id);
    revalidatePath('/network');
    return { ok: true, id: existing.id };
  }

  const { data: inserted, error } = await supabase
    .from('org_relationships')
    .insert({
      source_org_id: sourceOrgId,
      target_org_id: targetOrgId,
      type,
      tier: 'preferred',
      workspace_id: workspaceId,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  await syncOrgRelToCortex(supabase, inserted.id);
  revalidatePath('/network');
  return { ok: true, id: inserted.id };
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
    await supabase.from('organizations').update({ website: websiteTrim }).eq('id', ghost.id);
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
    const avatarUrl = (avatarRow as { avatar_url?: string | null } | null)?.avatar_url ?? null;

    const { data: entity } = await supabase
      .from('entities')
      .select('id, email')
      .eq('id', member.entity_id)
      .single();
    const name =
      [member.first_name, member.last_name].filter(Boolean).join(' ') ||
      entity?.email ||
      'Unknown';
    const role = member.role as 'owner' | 'admin' | 'member' | 'restricted' | null;
    const { entityId } = await getCurrentEntityAndOrg(supabase);
    let canAssignElevatedRole = false;
    if (entityId) {
      const { data: currentMember } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', sourceOrgId)
        .eq('entity_id', entityId)
        .maybeSingle();
      const currentRole = (currentMember?.role as string) ?? null;
      canAssignElevatedRole = currentRole === 'owner' || currentRole === 'admin';
    }

    return {
      id: member.id,
      kind: 'internal_employee',
      identity: {
        name,
        avatarUrl,
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
      memberRole: role ?? null,
      canAssignElevatedRole,
    };
  }

  const { data: rel, error: relError } = await supabase
    .from('org_relationships')
    .select('id, target_org_id, type, notes, tier, tags, lifecycle_status, blacklist_reason, deleted_at')
    .eq('id', nodeId)
    .eq('source_org_id', sourceOrgId)
    .maybeSingle();
  if (relError || !rel) return null;
  const relWithDeleted = rel as { deleted_at?: string | null };
  if (relWithDeleted.deleted_at) return null;

  const relRow = rel as { lifecycle_status?: string | null; blacklist_reason?: string | null };
  const lifecycleStatus = relRow.lifecycle_status as NodeDetail['lifecycleStatus'];
  const blacklistReason = relRow.blacklist_reason ?? null;

  const { data: orgEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, handle, avatar_url, attributes')
    .eq('legacy_org_id', rel.target_org_id)
    .maybeSingle();
  const orgAttrs = (orgEntity?.attributes as Record<string, unknown>) ?? {};
  const isGhost = (orgAttrs.is_ghost as boolean) ?? false;

  const relType = String(rel.type);
  const typeLabel =
    relType === 'vendor'
      ? 'Vendor'
      : relType === 'venue'
        ? 'Venue'
        : relType === 'client' || relType === 'client_company'
          ? 'Client'
          : 'Partner';
  const direction: NodeDetail['direction'] =
    relType === 'vendor'
      ? 'vendor'
      : relType === 'client' || relType === 'client_company'
        ? 'client'
        : relType === 'partner' || relType === 'venue'
          ? 'partner'
          : 'vendor';

  let crew: NodeDetail['crew'] = [];
  const targetOrgId = rel.target_org_id;
  const sys = getSystemClient();
  const [membersRes, affsRes] = await Promise.all([
    sys
      .from('org_members')
      .select('id, entity_id, first_name, last_name, role, job_title, avatar_url, phone')
      .eq('org_id', targetOrgId)
      .limit(500),
    sys
      .from('affiliations')
      .select('entity_id')
      .eq('organization_id', targetOrgId)
      .eq('status', 'active')
      .limit(500),
  ]);
  const members = membersRes.data ?? [];
  const affEntityIds = new Set((affsRes.data ?? []).map((a) => (a as { entity_id: string }).entity_id).filter(Boolean));
  members.forEach((m) => {
    if (m.entity_id) affEntityIds.add(m.entity_id);
  });
  const entityIds = [...affEntityIds];
  if (entityIds.length > 0) {
    const { data: entities } = await sys.from('entities').select('id, email').in('id', entityIds);
    const entityMap = new Map((entities ?? []).map((e) => [e.id, e]));
    const memberByEntity = new Map(
      (members as { entity_id: string | null; id: string; first_name: string | null; last_name: string | null; role?: string | null; job_title?: string | null; avatar_url?: string | null; phone?: string | null }[])
        .filter((m) => m.entity_id != null)
        .map((m) => [
          m.entity_id!,
          {
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            role: m.role ?? null,
            job_title: m.job_title ?? null,
            avatar_url: m.avatar_url ?? null,
            phone: m.phone ?? null,
          },
        ])
    );
    crew = entityIds.map((entity_id) => {
      const m = memberByEntity.get(entity_id);
      const e = entityMap.get(entity_id);
      const rawName = (m && [m.first_name, m.last_name].filter(Boolean).join(' ').trim()) || e?.email || null;
      const name = rawName && rawName.trim() ? rawName.trim() : 'Contact';
      return {
        id: m?.id ?? entity_id,
        name,
        email: e?.email ?? null,
        role: m?.role ?? null,
        jobTitle: m?.job_title ?? null,
        avatarUrl: m?.avatar_url ?? null,
        phone: m?.phone ?? null,
      };
    });
  }

  const relWithExtra = rel as { tier?: string | null; tags?: string[] | null };
  return {
    id: rel.id,
    kind: 'external_partner',
    identity: {
      name: orgEntity?.display_name ?? 'Unknown',
      avatarUrl: orgEntity?.avatar_url ?? null,
      label: typeLabel,
    },
    direction,
    balance: { inbound: 0, outbound: 0 },
    active_events: [],
    notes: rel.notes ?? null,
    relationshipId: rel.id,
    isGhost,
    targetOrgId: rel.target_org_id,
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
    relationshipTier: relWithExtra.tier ?? null,
    relationshipTags: relWithExtra.tags ?? null,
    lifecycleStatus: lifecycleStatus ?? null,
    blacklistReason: blacklistReason ?? null,
  };
}

/**
 * Update private notes for an org_relationship (Glass Slide-Over auto-save).
 */
export async function updateRelationshipNotes(
  relationshipId: string,
  notes: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

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

  // Prefer directory.entities for ghost org lookup; fallback to public.organizations
  const { data: ghostOrgDir } = await supabase
    .schema('directory')
    .from('entities')
    .select('owner_workspace_id, attributes')
    .eq('legacy_org_id', ghostOrgId)
    .maybeSingle();
  let ghostWorkspaceId: string | null = ghostOrgDir?.owner_workspace_id ?? null;
  let createdByOrgId: string | null = null;
  if (ghostOrgDir) {
    const attrs = (ghostOrgDir.attributes as Record<string, unknown>) ?? {};
    createdByOrgId = (attrs.created_by_org_id as string | null) ?? null;
  }
  if (!ghostWorkspaceId || !createdByOrgId) {
    const { data: ghostOrgLegacy } = await supabase
      .from('organizations')
      .select('workspace_id, created_by_org_id')
      .eq('id', ghostOrgId)
      .maybeSingle();
    if (!ghostWorkspaceId) ghostWorkspaceId = ghostOrgLegacy?.workspace_id ?? null;
    if (!createdByOrgId) createdByOrgId = (ghostOrgLegacy as { created_by_org_id?: string | null } | null)?.created_by_org_id ?? null;
  }
  if (!ghostWorkspaceId) return { ok: false, error: 'Partner org not found.' };
  if (createdByOrgId !== sourceOrgId) return { ok: false, error: 'Only the org that created this partner can add crew.' };

  const firstName = (payload.firstName ?? '').trim() || 'Contact';
  const lastName = (payload.lastName ?? '').trim() ?? '';
  const email =
    (payload.email ? String(payload.email).trim() : '') ||
    `ghost-${crypto.randomUUID()}@signal.local`;
  const role = (payload.role ? String(payload.role).trim() : null) ?? 'member';
  const jobTitle = payload.jobTitle ? String(payload.jobTitle).trim() || null : null;

  const sys = getSystemClient();
  const { data: entity, error: entityErr } = await sys
    .from('entities')
    .insert({ email, is_ghost: true })
    .select('id')
    .single();
  if (entityErr || !entity?.id) return { ok: false, error: entityErr?.message ?? 'Failed to create contact.' };

  type OrgMemberRole = 'owner' | 'admin' | 'member' | 'restricted';
  const { error: memberErr } = await sys.from('org_members').insert({
    org_id: ghostOrgId,
    entity_id: entity.id,
    workspace_id: ghostWorkspaceId,
    first_name: firstName,
    last_name: lastName,
    role: (role as OrgMemberRole) || 'member',
    job_title: jobTitle,
  });
  if (memberErr) {
    await sys.from('entities').delete().eq('id', entity.id);
    return { ok: false, error: memberErr.message ?? 'Failed to add to crew.' };
  }

  // Non-fatal: sync ghost person to directory.entities + create cortex ROSTER_MEMBER edge
  const { data: dirOrg } = await supabase
    .schema('directory').from('entities').select('id').eq('legacy_org_id', ghostOrgId).maybeSingle();
  let dirPersonId: string | null = null;
  const { data: existingDirPerson } = await sys
    .schema('directory').from('entities').select('id').eq('legacy_entity_id', entity.id).maybeSingle();
  if (existingDirPerson?.id) {
    dirPersonId = existingDirPerson.id;
  } else {
    const { data: newDirPerson } = await sys
      .schema('directory').from('entities')
      .insert({ legacy_entity_id: entity.id, display_name: [firstName, lastName].filter(Boolean).join(' ').trim() || email, type: 'person', owner_workspace_id: ghostWorkspaceId, claimed_by_user_id: null, attributes: { is_ghost: true, email } })
      .select('id').maybeSingle();
    dirPersonId = newDirPerson?.id ?? null;
  }
  if (dirPersonId && dirOrg?.id) {
    await supabase.rpc('upsert_relationship', {
      p_source_entity_id: dirPersonId,
      p_target_entity_id: dirOrg.id,
      p_type: 'ROSTER_MEMBER',
      p_context_data: { first_name: firstName, last_name: lastName, role, job_title: jobTitle },
    });
  }

  revalidatePath('/network');
  return { ok: true };
}

/** Batch-add Scout roster to ghost org. Inserts entity + org_member directly so creator can add crew (same as addContactToGhostOrg). */
export async function addScoutRosterToGhostOrg(
  sourceOrgId: string,
  ghostOrgId: string,
  roster: Array<{ firstName: string; lastName: string; jobTitle?: string | null; avatarUrl?: string | null; email?: string | null }>
): Promise<{ ok: boolean; addedCount: number; error?: string }> {
  if (!roster?.length) return { ok: true, addedCount: 0 };
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Unauthorized.' };

  // Prefer directory.entities for ghost org lookup; fallback to public.organizations
  const { data: ghostOrgDir2 } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id, attributes')
    .eq('legacy_org_id', ghostOrgId)
    .maybeSingle();
  let ghostWorkspaceId2: string | null = ghostOrgDir2?.owner_workspace_id ?? null;
  let createdByOrgId2: string | null = null;
  if (ghostOrgDir2) {
    const attrs = (ghostOrgDir2.attributes as Record<string, unknown>) ?? {};
    createdByOrgId2 = (attrs.created_by_org_id as string | null) ?? null;
  }
  if (!ghostWorkspaceId2 || !createdByOrgId2) {
    const { data: ghostOrgLegacy2 } = await supabase
      .from('organizations')
      .select('workspace_id, created_by_org_id')
      .eq('id', ghostOrgId)
      .maybeSingle();
    if (!ghostWorkspaceId2) ghostWorkspaceId2 = ghostOrgLegacy2?.workspace_id ?? null;
    if (!createdByOrgId2) createdByOrgId2 = (ghostOrgLegacy2 as { created_by_org_id?: string | null } | null)?.created_by_org_id ?? null;
  }
  if (!ghostWorkspaceId2) return { ok: false, addedCount: 0, error: 'Partner org not found.' };
  if (createdByOrgId2 !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Only the org that created this partner can add crew.' };
  const dirOrgId2 = ghostOrgDir2?.id ?? null;

  const sys = getSystemClient();
  let addedCount = 0;
  let firstError: string | null = null;
  for (const m of roster) {
    const firstName = (m.firstName ?? '').trim() || 'Contact';
    const lastName = (m.lastName ?? '').trim() ?? '';
    const emailRaw = m.email && typeof m.email === 'string' ? m.email.trim() : '';
    const email = emailRaw || `ghost-${crypto.randomUUID()}@signal.local`;
    const jobTitle = m.jobTitle && typeof m.jobTitle === 'string' ? m.jobTitle.trim() || null : null;
    const avatarUrl = m.avatarUrl && typeof m.avatarUrl === 'string' ? m.avatarUrl.trim() || null : null;

    const { data: entity, error: entityErr } = await sys
      .from('entities')
      .insert({ email, is_ghost: true })
      .select('id')
      .single();
    if (entityErr || !entity?.id) {
      if (!firstError) firstError = entityErr?.message ?? 'Failed to create contact';
      continue;
    }
    const { data: member, error: memberErr } = await sys
      .from('org_members')
      .insert({
        org_id: ghostOrgId,
        entity_id: entity.id,
        workspace_id: ghostWorkspaceId2,
        first_name: firstName,
        last_name: lastName,
        role: 'member',
        job_title: jobTitle,
      })
      .select('id')
      .single();
    if (memberErr) {
      await sys.from('entities').delete().eq('id', entity.id);
      if (!firstError) firstError = memberErr.message ?? 'Failed to add to crew';
      continue;
    }
    addedCount += 1;
    if (member?.id && avatarUrl) {
      await sys.from('org_members').update({ avatar_url: avatarUrl }).eq('id', member.id).eq('org_id', ghostOrgId);
    }

    // Non-fatal: sync ghost person to directory.entities + create cortex ROSTER_MEMBER edge
    let dirPersonId2: string | null = null;
    const { data: existingDirP } = await sys
      .schema('directory').from('entities').select('id').eq('legacy_entity_id', entity.id).maybeSingle();
    if (existingDirP?.id) {
      dirPersonId2 = existingDirP.id;
    } else {
      const { data: newDirP } = await sys
        .schema('directory').from('entities')
        .insert({ legacy_entity_id: entity.id, display_name: [firstName, lastName].filter(Boolean).join(' ').trim() || email, type: 'person', owner_workspace_id: ghostWorkspaceId2, claimed_by_user_id: null, attributes: { is_ghost: true, email } })
        .select('id').maybeSingle();
      dirPersonId2 = newDirP?.id ?? null;
    }
    if (dirPersonId2 && dirOrgId2) {
      await supabase.rpc('upsert_relationship', {
        p_source_entity_id: dirPersonId2,
        p_target_entity_id: dirOrgId2,
        p_type: 'ROSTER_MEMBER',
        p_context_data: { first_name: firstName, last_name: lastName, role: 'member', job_title: jobTitle },
      });
    }
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
export async function updateOrgMemberRole(
  orgMemberId: string,
  sourceOrgId: string,
  newRole: 'owner' | 'admin' | 'manager' | 'member' | 'restricted'
): Promise<UpdateOrgMemberRoleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!entity) return { ok: false, error: 'Account not linked.' };

  const { data: currentMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', sourceOrgId)
    .eq('entity_id', entity.id)
    .maybeSingle();
  const currentRole = (currentMember?.role as OrgMemberRoleDb | null) ?? null;
  if (!currentRole || !['owner', 'admin'].includes(currentRole)) {
    return { ok: false, error: 'Only owners and admins can change roles.' };
  }
  if (newRole === 'owner' && currentRole !== 'owner') {
    return { ok: false, error: 'Only the owner can assign the owner role.' };
  }

  const dbRole: OrgMemberRoleDb = newRole === 'manager' ? 'member' : newRole;

  const { data: target } = await supabase
    .from('org_members')
    .select('id')
    .eq('id', orgMemberId)
    .eq('org_id', sourceOrgId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Member not found.' };

  const { error } = await supabase
    .from('org_members')
    .update({ role: dbRole })
    .eq('id', orgMemberId)
    .eq('org_id', sourceOrgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/network');
  revalidatePath('/settings/team');
  return { ok: true };
}
