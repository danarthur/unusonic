 
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
import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR, VENUE_OPS, COUPLE_ATTR, INDIVIDUAL_ATTR } from '../model/attribute-keys';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2, restricted: 3 };

/** HQ org resolution: uses cortex.relationships ROSTER_MEMBER/MEMBER edges. */
const ORG_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  member: 3,
  restricted: 4,
};

/** Maps relationship type string to cortex relationship_type. */
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
      .select('id, source_entity_id, context_data, created_at')
      .eq('target_entity_id', orgDirEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER'),
    supabase.schema('cortex').from('relationships')
      .select('id, target_entity_id, relationship_type, context_data, created_at')
      .eq('source_entity_id', orgDirEnt.id)
      .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT', 'VENUE_PARTNER']),
  ]);

  const rosterEdges = rosterRes.data ?? [];
  const allPartnerEdges = partnerRes.data ?? [];
  const innerCircleEdges = allPartnerEdges.filter((r) => {
    const ctx = (r.context_data as Record<string, unknown>) ?? {};
    return ctx.tier === 'preferred' && !ctx.deleted_at;
  });
  const outerOrbitEdges = allPartnerEdges.filter((r) => {
    const ctx = (r.context_data as Record<string, unknown>) ?? {};
    return ctx.tier !== 'preferred' && !ctx.deleted_at;
  });

  // Fetch person entities and partner org entities (inner circle + outer orbit combined)
  const personEntityIds = [...new Set(rosterEdges.map((e) => e.source_entity_id))];
  const innerCircleEntityIds = [...new Set(innerCircleEdges.map((e) => e.target_entity_id))];
  const outerOrbitEntityIds = [...new Set(outerOrbitEdges.map((e) => e.target_entity_id))];
  const allPartnerEntityIds = [...new Set([...innerCircleEntityIds, ...outerOrbitEntityIds])];

  // All person entity IDs (roster + inner circle persons) for crew_skills lookup
  const allPersonEntityIds = [...new Set([...personEntityIds, ...innerCircleEntityIds])];

  // All entity IDs for referral count lookup (roster + partners)
  const allEntityIds = [...new Set([...personEntityIds, ...allPartnerEntityIds])];

  const [personEntRes, partnerEntRes, invoicesRes, crewSkillsRes, referralCountRes, capabilitiesRes] = await Promise.all([
    personEntityIds.length > 0
      ? supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, type, attributes')
          .in('id', personEntityIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null; type: string | null; attributes: unknown }[] },
    allPartnerEntityIds.length > 0
      ? supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, legacy_org_id, type, attributes')
          .in('id', allPartnerEntityIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null; legacy_org_id: string | null; type: string | null; attributes: unknown }[] },
    // Batch outstanding balance — single query for all partners (inner + outer)
    allPartnerEntityIds.length > 0
      ? supabase.schema('finance').from('invoices')
          .select('bill_to_entity_id, total_amount')
          .in('bill_to_entity_id', allPartnerEntityIds)
          .not('status', 'in', '(paid,void)')
      : { data: [] as { bill_to_entity_id: string; total_amount: number }[] },
    // Crew skills from ops.crew_skills (source of truth)
    allPersonEntityIds.length > 0
      ? supabase.schema('ops').from('crew_skills')
          .select('entity_id, skill_tag')
          .in('entity_id', allPersonEntityIds)
          .eq('workspace_id', orgId)
      : { data: [] as { entity_id: string; skill_tag: string }[] },
    // Batch referral count — how many deals each entity has referred
    allEntityIds.length > 0
      ? supabase
          .from('deals')
          .select('referrer_entity_id')
          .in('referrer_entity_id', allEntityIds)
          .not('referrer_entity_id', 'is', null)
      : { data: [] as { referrer_entity_id: string }[] },
    // Business capabilities from ops.entity_capabilities
    allPersonEntityIds.length > 0
      ? supabase.schema('ops').from('entity_capabilities')
          .select('entity_id, capability')
          .in('entity_id', allPersonEntityIds)
          .eq('workspace_id', orgId)
      : { data: [] as { entity_id: string; capability: string }[] },
  ]);

  // Build skills map from ops.crew_skills
  const crewSkillsByEntityId = new Map<string, string[]>();
  for (const row of crewSkillsRes.data ?? []) {
    const list = crewSkillsByEntityId.get(row.entity_id) ?? [];
    list.push(row.skill_tag);
    crewSkillsByEntityId.set(row.entity_id, list);
  }

  // Build capabilities map from ops.entity_capabilities
  const capabilitiesByEntityId = new Map<string, string[]>();
  for (const row of (capabilitiesRes.data ?? []) as { entity_id: string; capability: string }[]) {
    const list = capabilitiesByEntityId.get(row.entity_id) ?? [];
    list.push(row.capability);
    capabilitiesByEntityId.set(row.entity_id, list);
  }

  // Aggregate outstanding balance per entity in JS
  const balanceMap = new Map<string, number>();
  for (const inv of (invoicesRes.data ?? [])) {
    balanceMap.set(inv.bill_to_entity_id, (balanceMap.get(inv.bill_to_entity_id) ?? 0) + (inv.total_amount ?? 0));
  }

  // Aggregate referral count per entity
  const referralCountMap = new Map<string, number>();
  for (const row of (referralCountRes.data ?? []) as { referrer_entity_id: string }[]) {
    referralCountMap.set(row.referrer_entity_id, (referralCountMap.get(row.referrer_entity_id) ?? 0) + 1);
  }

  const personMap = new Map((personEntRes.data ?? []).map((p) => [p.id, p]));
  const partnerEntMap = new Map((partnerEntRes.data ?? []).map((p) => [p.id, p]));
  /** @deprecated use partnerEntMap — kept for backward compat within this function */
  const partnerMap = partnerEntMap;

  function buildRosterNode(edge: (typeof rosterEdges)[number], isExternal: boolean): NetworkNode {
    const ctx = (edge.context_data as Record<string, unknown>) ?? {};
    const person = personMap.get(edge.source_entity_id);
    const attrs = (person?.attributes as Record<string, unknown>) ?? {};
    const email = (attrs[PERSON_ATTR.email] as string | null) ?? null;
    const name =
      [(ctx.first_name as string) ?? '', (ctx.last_name as string) ?? ''].filter(Boolean).join(' ') ||
      person?.display_name || email || 'Unknown';
    const avatarUrl = person?.avatar_url ?? null;
    const role = (ctx.role as string) ?? 'member';
    const jobTitle = (attrs[PERSON_ATTR.job_title] as string | null) ?? (ctx.job_title as string | null) ?? null;
    const entityType = (person?.type as 'person' | 'company' | 'venue' | 'couple') ?? undefined;
    const phone = (attrs[PERSON_ATTR.phone] as string | null) ?? null;
    const w9Status = (attrs[PERSON_ATTR.w9_status] as boolean | null) ?? null;
    const coiExpiry = (attrs[PERSON_ATTR.coi_expiry] as string | null) ?? null;
    const market = (attrs[PERSON_ATTR.market] as string | null) ?? null;
    const unionStatus = (attrs[PERSON_ATTR.union_status] as string | null) ?? null;
    return {
      id: edge.id,
      entityId: edge.source_entity_id,
      kind: isExternal ? 'extended_team' : 'internal_employee',
      gravity: 'core',
      roleGroup: jobTitle || null,
      identity: { name, avatarUrl, label: jobTitle || role || 'Member', entityType },
      meta: {
        email: email ?? undefined,
        phone: phone ?? undefined,
        tags: crewSkillsByEntityId.get(edge.source_entity_id) ?? [],
        capabilities: capabilitiesByEntityId.get(edge.source_entity_id) ?? [],
        connectedSince: (edge as { created_at?: string }).created_at ?? undefined,
        doNotRebook: (ctx.do_not_rebook as boolean) ?? false,
        archived: (ctx.archived as boolean) ?? false,
        w9_status: w9Status,
        coi_expiry: coiExpiry,
        market,
        union_status: unionStatus,
      },
    };
  }

  const sortRosterNodes = (nodes: NetworkNode[]) =>
    [...nodes].sort((a, b) => {
      const orderA = ROLE_ORDER[a.identity.label] ?? 99;
      const orderB = ROLE_ORDER[b.identity.label] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.identity.name.localeCompare(b.identity.name);
    });

  const coreNodes: NetworkNode[] = sortRosterNodes(
    rosterEdges
      .filter((e) => (e.context_data as Record<string, unknown>)?.employment_status !== 'external_contractor')
      .map((e) => buildRosterNode(e, false))
  );

  const extendedTeamNodes: NetworkNode[] = sortRosterNodes(
    rosterEdges
      .filter((e) => (e.context_data as Record<string, unknown>)?.employment_status === 'external_contractor')
      .map((e) => buildRosterNode(e, true))
  );

  function cortexTypeToLabel(type: string): string {
    switch (type) {
      case 'VENDOR': return 'Vendor';
      case 'VENUE_PARTNER': return 'Venue';
      case 'CLIENT': return 'Client';
      default: return 'Partner';
    }
  }

  // Deduplicate: if a person has both ROSTER_MEMBER and PARTNER edges, roster wins
  const rosterEntityIdSet = new Set(personEntityIds);
  const dedupedInnerCircleEdges = innerCircleEdges.filter((e) => !rosterEntityIdSet.has(e.target_entity_id));

  const innerCircleNodes: NetworkNode[] = dedupedInnerCircleEdges.map((edge): NetworkNode => {
    const partner = partnerMap.get(edge.target_entity_id);
    const ctx = (edge.context_data as Record<string, unknown>) ?? {};
    const balance = balanceMap.get(edge.target_entity_id) ?? 0;
    const refCount = referralCountMap.get(edge.target_entity_id) ?? 0;
    const entityType = (partner?.type as 'person' | 'company' | 'venue' | 'couple') ?? undefined;
    const attrs = (partner?.attributes as Record<string, unknown>) ?? {};
    // Use COUPLE_ATTR / PERSON_ATTR constants so couple entities never ghost-read a
    // preserved email key from a prior person → couple reclassification.
    const email =
      entityType === 'couple'
        ? ((attrs[COUPLE_ATTR.partner_a_email] as string) ?? undefined)
        : entityType === 'person'
          ? ((attrs[PERSON_ATTR.email] as string) ?? undefined)
          : undefined;
    // For person entities in inner circle (freelancers), derive roleGroup from job_title
    const personJobTitle = entityType === 'person' ? (attrs[PERSON_ATTR.job_title] as string | null) ?? null : null;
    return {
      id: edge.id,
      entityId: edge.target_entity_id,
      kind: 'external_partner',
      gravity: 'inner_circle',
      roleGroup: personJobTitle,
      identity: {
        name: partner?.display_name ?? 'Unknown',
        avatarUrl: null,
        label: entityType === 'person' ? (personJobTitle || 'Freelancer') : cortexTypeToLabel(edge.relationship_type),
        entityType,
      },
      meta: {
        email,
        tags: entityType === 'person'
          ? (crewSkillsByEntityId.get(edge.target_entity_id) ?? [])
          : ((ctx.industry_tags as string[] | null) ?? []),
        capabilities: entityType === 'person'
          ? (capabilitiesByEntityId.get(edge.target_entity_id) ?? [])
          : [],
        ...(balance > 0 ? { outstanding_balance: balance } : {}),
        ...(refCount > 0 ? { referral_count: refCount } : {}),
        connectedSince: (edge as { created_at?: string }).created_at ?? undefined,
      },
    };
  }).sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  const outerOrbitNodes: NetworkNode[] = outerOrbitEdges.map((rel): NetworkNode => {
    const ctx = (rel.context_data as Record<string, unknown>) ?? {};
    const partnerEnt = partnerEntMap.get(rel.target_entity_id);
    const balance = balanceMap.get(rel.target_entity_id) ?? 0;
    const refCount = referralCountMap.get(rel.target_entity_id) ?? 0;

    // Use the edge column as the canonical type source — context_data.relationship_type
    // is not a defined cortex field and should not influence labels.
    const typeLabel = cortexTypeToLabel(rel.relationship_type);
    const entityType = (partnerEnt?.type as 'person' | 'company' | 'venue' | 'couple') ?? undefined;
    const attrs = (partnerEnt?.attributes as Record<string, unknown>) ?? {};
    // Use COUPLE_ATTR / PERSON_ATTR constants so couple entities never ghost-read a
    // preserved email key from a prior person → couple reclassification.
    const email =
      entityType === 'couple'
        ? ((attrs[COUPLE_ATTR.partner_a_email] as string) ?? undefined)
        : entityType === 'person'
          ? ((attrs[PERSON_ATTR.email] as string) ?? undefined)
          : undefined;

    return {
      id: rel.id,
      entityId: rel.target_entity_id,
      kind: 'external_partner' as const,
      gravity: 'outer_orbit' as const,
      identity: {
        name: partnerEnt?.display_name ?? 'Unknown',
        label: typeLabel,
        avatarUrl: partnerEnt?.avatar_url ?? null,
        entityType,
      },
      meta: {
        email,
        tags: Array.isArray(ctx.industry_tags) ? (ctx.industry_tags as string[]) : [],
        ...(balance > 0 ? { outstanding_balance: balance } : {}),
        ...(refCount > 0 ? { referral_count: refCount } : {}),
        connectedSince: (rel as { created_at?: string }).created_at ?? undefined,
      },
    };
  }).sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  return [...coreNodes, ...extendedTeamNodes, ...innerCircleNodes, ...outerOrbitNodes];
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
  relationshipType?: 'vendor' | 'client' | 'venue' | 'partner';
  w9Status?: boolean;
  coiExpiry?: string;
  paymentTerms?: string;
  // Venue-specific (subset of organization)
  dockAddress?: string;
  venuePmName?: string;
  venuePmPhone?: string;
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

  // ── Attribute patch: website + professional fields ─────────────────────
  // ghost.id is directory.entities.id (Session 9: createGhostOrg writes only to directory)
  const websiteTrim = payload.website?.trim();

  // Collect all top-level attribute fields to patch in a single write
  const attrPatch: Record<string, unknown> = {};

  if (websiteTrim) attrPatch[COMPANY_ATTR.website] = websiteTrim;

  if (payload.type === 'person') {
    if (payload.phone) attrPatch[PERSON_ATTR.phone] = payload.phone;
    if (payload.market) attrPatch[PERSON_ATTR.market] = payload.market;
    if (payload.unionStatus) attrPatch[PERSON_ATTR.union_status] = payload.unionStatus;
  }

  if (payload.type === 'organization') {
    if (payload.w9Status !== undefined) attrPatch[COMPANY_ATTR.w9_status] = payload.w9Status;
    if (payload.coiExpiry) attrPatch[COMPANY_ATTR.coi_expiry] = payload.coiExpiry;
    if (payload.paymentTerms) attrPatch[COMPANY_ATTR.payment_terms] = payload.paymentTerms;

    // Venue ops fields go under attributes.venue_ops sub-object — never top-level
    const venueOpsPatch: Record<string, unknown> = {};
    if (payload.dockAddress) venueOpsPatch[VENUE_OPS.dock_address] = payload.dockAddress;
    if (payload.venuePmName) venueOpsPatch[VENUE_OPS.venue_contact_name] = payload.venuePmName;
    if (payload.venuePmPhone) venueOpsPatch[VENUE_OPS.venue_contact_phone] = payload.venuePmPhone;

    if (Object.keys(venueOpsPatch).length > 0) {
      // Read existing venue_ops first to avoid overwriting sibling keys
      const { data: ghostDirForVenue } = await supabase
        .schema('directory').from('entities')
        .select('attributes').eq('id', ghost.id).maybeSingle();
      const existingForVenue = (ghostDirForVenue?.attributes as Record<string, unknown>) ?? {};
      const existingVenueOps = (existingForVenue[VENUE_ATTR.venue_ops] as Record<string, unknown>) ?? {};
      attrPatch[VENUE_ATTR.venue_ops] = { ...existingVenueOps, ...venueOpsPatch };
    }
  }

  if (Object.keys(attrPatch).length > 0) {
    const { data: ghostDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('attributes').eq('id', ghost.id).maybeSingle();
    const existingAttrs = (ghostDirEnt?.attributes as Record<string, unknown>) ?? {};
    await supabase.schema('directory').from('entities')
      .update({ attributes: { ...existingAttrs, ...attrPatch } })
      .eq('id', ghost.id);
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

export type NetworkSearchOrg = {
  id: string;
  /** The directory.entities UUID — always set, used for roster lookups. */
  entity_uuid?: string;
  name: string;
  logo_url?: string | null;
  is_ghost?: boolean;
  /** Entity type from directory.entities — 'company', 'person', 'couple', 'venue', etc. */
  entity_type?: string | null;
  /** 'connection' = already in your rolodex; 'global' = public Unusonic directory. */
  _source?: 'connection' | 'global';
};

/**
 * Search two universes for OmniSearch: Your connections first, then global public directory.
 * Prevents creating duplicate ghosts (e.g. "Acme Catering" already in rolodex).
 * RLS: user must belong to sourceOrg.
 */
export async function searchNetworkOrgs(
  sourceOrgId: string,
  query: string,
  options?: { entityType?: string }
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
  const workspaceId: string | null = srcEntity?.owner_workspace_id ?? null;
  let connectionResults: NetworkSearchOrg[] = [];
  let connectionIds: string[] = [];

  if (srcEntity?.id && workspaceId) {
    // CORTEX PATH: get my active connection target entity IDs
    // NOTE: ROSTER_MEMBER is intentionally excluded from this filter.
    // Crew-specific search (which surfaces internal team members) should use
    // searchCrewMembers() from src/app/(dashboard)/(features)/crm/actions/deal-crew.ts instead.
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
      const connQ = supabase
        .schema('directory')
        .from('entities')
        .select('id, type, display_name, avatar_url, attributes, legacy_org_id')
        .in('id', activeTargetIds)
        .ilike('display_name', `%${q}%`);
      const { data: targetEntities } = await (options?.entityType
        ? connQ.eq('type', options.entityType)
        : connQ
      ).limit(10);

      connectionResults = (targetEntities ?? []).map((e) => {
        const attrs = (e.attributes as Record<string, unknown>) ?? {};
        const legacyId = (e.legacy_org_id as string | null) ?? e.id;
        const first = (attrs.first_name as string | undefined) ?? '';
        const last = (attrs.last_name as string | undefined) ?? '';
        const constructed = [first, last].filter(Boolean).join(' ').trim();
        return {
          id: legacyId,
          entity_uuid: e.id,
          name: constructed || e.display_name,
          logo_url: (e.avatar_url as string | null) ?? null,
          is_ghost: (attrs.is_ghost as boolean) ?? false,
          entity_type: (e.type as string) ?? null,
          _source: 'connection' as const,
        };
      });
    }
    connectionIds = connectionResults.map((r) => r.id);
  }

  if (!workspaceId) return connectionResults;

  const excludeSet = new Set([sourceOrgId, ...connectionIds]);

  // 2. GLOBAL DIRECTORY — preferred: directory.entities; fallback: organizations
  let globalResults: NetworkSearchOrg[] = [];
  const globalQ = supabase
    .schema('directory')
    .from('entities')
    .select('id, type, display_name, avatar_url, attributes, legacy_org_id')
    .eq('owner_workspace_id', workspaceId)
    .ilike('display_name', `%${q}%`);
  const { data: globalEntities } = await (options?.entityType
    ? globalQ.eq('type', options.entityType)
    : globalQ
  ).limit(15);

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
      const first = (attrs.first_name as string | undefined) ?? '';
      const last = (attrs.last_name as string | undefined) ?? '';
      const constructed = [first, last].filter(Boolean).join(' ').trim();
      return {
        id: eid,
        entity_uuid: e.id,
        name: constructed || e.display_name,
        logo_url: (e.avatar_url as string | null) ?? null,
        is_ghost: (attrs.is_ghost as boolean) ?? false,
        entity_type: (e.type as string) ?? null,
        _source: 'global' as const,
      };
    });
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
  kind: 'internal_employee' | 'extended_team' | 'external_partner';
  identity: {
    name: string;
    avatarUrl: string | null;
    label: string;
    email?: string;
  };
  /** Relationship direction for partners: vendor (money out), client (money in), partner (both). */
  direction: 'vendor' | 'client' | 'partner' | null;
  /**
   * Raw relationship type string as returned by the server before collapsing to direction.
   * Values: 'vendor' | 'venue' | 'client' | 'client_company' | 'partner'.
   * Use this (not `direction`) when initialising edit-form state so venue relationships
   * don't get silently reclassified to vendor on save.
   */
  relationshipTypeRaw?: string | null;
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
  /** For internal_employee: invite status — 'ghost' (unsent), 'invited' (pending), 'active' (claimed). */
  inviteStatus?: 'ghost' | 'invited' | 'active' | null;
  /** For internal_employee: org_members.role (owner | admin | member | restricted). */
  memberRole?: 'owner' | 'admin' | 'member' | 'restricted' | null;
  /** For internal_employee: whether current user can assign admin/manager (owner or admin). */
  canAssignElevatedRole?: boolean;
  /** For internal_employee: do-not-rebook flag from ROSTER_MEMBER edge context_data. */
  doNotRebook?: boolean;
  /** For internal_employee: archived flag from ROSTER_MEMBER edge context_data. */
  archived?: boolean;
  /** For internal_employee: phone from directory.entities.attributes. */
  phone?: string | null;
  /** For internal_employee: market from directory.entities.attributes. */
  market?: string | null;
  /**
   * Audit trail for the ROSTER_MEMBER edge — set by the Postgres trigger whenever
   * context_data changes. Surfaces on hover in the detail sheet.
   */
  lastModifiedAt?: string | null;
  lastModifiedByName?: string | null;
  /**
   * The `directory.entities.id` of the subject being viewed (person or org).
   * Distinct from `id` which is the cortex relationship edge ID.
   * Use this for context panel queries (crew schedule, deals, finance).
   */
  subjectEntityId?: string | null;
  /** The `directory.entities.type` value ('person', 'company', 'venue', etc.) */
  entityDirectoryType?: string | null;
  /** For external_partner person entities: email from INDIVIDUAL_ATTR */
  personEmail?: string | null;
  /** For external_partner person entities: phone from INDIVIDUAL_ATTR */
  personPhone?: string | null;
  /** For external_partner couple entities: partner B email */
  couplePartnerBEmail?: string | null;
  /** For external_partner couple entities: partner A full name */
  couplePartnerAName?: string | null;
  /** For external_partner couple entities: partner B full name */
  couplePartnerBName?: string | null;
  /** For crew entities: skill tags from ops.crew_skills. */
  skillTags?: string[];
  /** For crew entities: most recent confirmed assignment. */
  lastBooked?: {
    eventTitle: string;
    role: string;
    date: string; // ISO
  } | null;
  /** For crew entities: total day_rate paid across confirmed assignments. */
  totalPaid?: number | null;
  /** For crew entities: count of confirmed assignments. */
  showCount?: number | null;
  /** Venue-specific technical spec fields, from directory.entities.attributes */
  orgVenueSpecs?: {
    capacity?: number | null;
    load_in_notes?: string | null;
    power_notes?: string | null;
    stage_notes?: string | null;
  } | null;
  /** For external_partner: total invoiced amount (clients) or total spent (vendors). */
  lifetimeValue?: number | null;
  /** For external_partner: ISO date of most recent event involving this entity. */
  lastActiveDate?: string | null;
  /** For external_partner: count of events this partner was involved in. */
  partnerShowCount?: number | null;
  /** Computed relationship strength based on recency, frequency, and value. */
  relationshipStrength?: 'new' | 'growing' | 'strong' | 'cooling' | null;
};

/**
 * Compute a qualitative relationship strength label from show count, recency, and lifetime value.
 * Returns null only if all inputs are null (no data to compute from).
 */
function computeRelationshipStrength(
  showCount: number | null,
  lastActiveDate: string | null,
  _lifetimeValue: number | null,
): 'new' | 'growing' | 'strong' | 'cooling' | null {
  if (showCount === 0 || showCount == null) return 'new';

  if (lastActiveDate) {
    const monthsAgo = (Date.now() - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo > 6) return 'cooling';
    if (showCount >= 5 && monthsAgo <= 3) return 'strong';
  }

  return 'growing';
}

/**
 * Fetch deep context for a Network node (employee or partner) for the Glass Slide-Over.
 * Scoped to current user's org. Balance/events mocked if finance tables not linked.
 * Uses unstable_noStore so crew list is always fresh after adding a member (no cached placeholder).
 */
export async function getNetworkNodeDetails(
  nodeId: string,
  kind: 'internal_employee' | 'extended_team' | 'external_partner',
  sourceOrgId: string
): Promise<NodeDetail | null> {
  unstable_noStore();
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return null;

  if (kind === 'internal_employee' || kind === 'extended_team') {
    // Cortex-first: nodeId is cortex.relationships.id (ROSTER_MEMBER edge)
    const { data: cortexRel } = await supabase
      .schema('cortex').from('relationships')
      .select('id, source_entity_id, target_entity_id, context_data')
      .eq('id', nodeId).eq('relationship_type', 'ROSTER_MEMBER').maybeSingle();

    if (cortexRel) {
      const ctx = (cortexRel.context_data as Record<string, unknown>) ?? {};
      const { data: personEnt } = await supabase
        .schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
        .eq('id', cortexRel.source_entity_id).maybeSingle();
      const attrs = (personEnt?.attributes as Record<string, unknown>) ?? {};
      const email = (attrs[PERSON_ATTR.email] as string | null) ?? null;

      // Resolve invite status for internal employees
      let inviteStatus: 'ghost' | 'invited' | 'active' = 'active';
      if (!personEnt?.claimed_by_user_id) {
        // Unclaimed — check if invitation was sent
        if (email) {
          const { data: inv } = await supabase
            .from('invitations')
            .select('id')
            .ilike('email', email)
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();
          inviteStatus = inv ? 'invited' : 'ghost';
        } else {
          inviteStatus = 'ghost';
        }
      }
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

      const employmentStatus = (ctx.employment_status as string | null) ?? null;
      const resolvedKind: NodeDetail['kind'] =
        employmentStatus === 'external_contractor' ? 'extended_team' : 'internal_employee';

      // Parallel queries: skill tags, last booked, crew cost
      const entityId_ = cortexRel.source_entity_id;
      const [skillsRes, lastBookedRes, costRes] = await Promise.all([
        supabase
          .schema('ops')
          .from('crew_skills')
          .select('skill_tag')
          .eq('entity_id', entityId_)
          .order('skill_tag')
          .limit(20),
        supabase
          .schema('ops')
          .from('deal_crew')
          .select('role_note, call_time, day_rate')
          .eq('entity_id', entityId_)
          .not('confirmed_at', 'is', null)
          .order('call_time', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema('ops')
          .from('deal_crew')
          .select('day_rate')
          .eq('entity_id', entityId_)
          .not('confirmed_at', 'is', null)
          .not('day_rate', 'is', null),
      ]);

      const skillTags = (skillsRes.data ?? []).map((s) => s.skill_tag);

      // Resolve last booked event title
      let lastBooked: NodeDetail['lastBooked'] = null;
      if (lastBookedRes.data) {
        const lb = lastBookedRes.data as { role_note: string | null; call_time: string | null; day_rate: number | null };
        lastBooked = {
          eventTitle: '', // We'd need a join to get the event title — keep it lightweight for now
          role: lb.role_note ?? 'Crew',
          date: lb.call_time ?? '',
        };
      }

      // Sum total paid
      const costRows = (costRes.data ?? []) as { day_rate: number | null }[];
      const totalPaid = costRows.reduce((sum, r) => sum + (r.day_rate ?? 0), 0) || null;
      const showCount = costRows.length || null;

      return {
        id: cortexRel.id,
        kind: resolvedKind,
        identity: {
          name,
          avatarUrl: personEnt?.avatar_url ?? null,
          label: (attrs[PERSON_ATTR.job_title] as string | null) ?? (ctx.job_title as string | null) ?? role ?? 'Member',
          email: email ?? undefined,
        },
        direction: null,
        balance: { inbound: 0, outbound: 0 },
        active_events: [],
        notes: (ctx.notes as string | null) ?? null,
        relationshipId: cortexRel.id,
        isGhost: false,
        targetOrgId: null,
        inviteStatus,
        skillTags,
        lastBooked,
        totalPaid,
        showCount,
        memberRole: role ?? null,
        canAssignElevatedRole,
        doNotRebook: (ctx.do_not_rebook as boolean) ?? false,
        archived: (ctx.archived as boolean) ?? false,
        phone: (attrs[PERSON_ATTR.phone] as string | null) ?? null,
        market: (attrs[PERSON_ATTR.market] as string | null) ?? null,
        lastModifiedAt: (ctx.last_modified_at as string | null) ?? null,
        lastModifiedByName: (ctx.last_modified_by_name as string | null) ?? null,
        subjectEntityId: cortexRel.source_entity_id,
        relationshipStrength: computeRelationshipStrength(
          showCount,
          lastBooked?.date ?? null,
          totalPaid,
        ),
      };
    }

    return null;
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
  let orgEntity: { id: string; display_name: string; handle: string | null; avatar_url: string | null; attributes: unknown; type?: string | null } | null = null;

  if (!cortexExtRel) return null;

  {
    const ctx = (cortexExtRel.context_data as Record<string, unknown>) ?? {};
    if (ctx.deleted_at) return null;
    relId = cortexExtRel.id;
    targetEntityIdForCrew = cortexExtRel.target_entity_id;
    relNotes = (ctx.notes as string | null) ?? null;
    relTier = (ctx.tier as string | null) ?? null;
    relTags = (ctx.industry_tags as string[] | null) ?? null;
    relLifecycleStatus = (ctx.lifecycle_status as NodeDetail['lifecycleStatus']) ?? null;
    relBlacklistReason = (ctx.blacklist_reason as string | null) ?? null;
    relType = cortexExtRel.relationship_type
      .toLowerCase()
      .replace('venue_partner', 'venue')
      .replace('_', ' ');

    const { data: orgEnt } = await supabase
      .schema('directory').from('entities')
      .select('id, display_name, handle, avatar_url, attributes, legacy_org_id, type')
      .eq('id', cortexExtRel.target_entity_id).maybeSingle();
    if (!orgEnt) return null;
    orgEntity = orgEnt;
    targetOrgIdLegacy = orgEnt.legacy_org_id ?? orgEnt.id;
  }

  const orgAttrs = (orgEntity?.attributes as Record<string, unknown>) ?? {};
  const isGhost = (orgAttrs[COMPANY_ATTR.is_ghost] as boolean) ?? false;

  // Person/couple contact extraction — INDIVIDUAL_ATTR/COUPLE_ATTR keys
  const _entityDirType = (orgEntity as { type?: string | null }).type ?? null;
  const personEmail: string | null =
    _entityDirType === 'person' ? ((orgAttrs[INDIVIDUAL_ATTR.email] as string) ?? null)
    : _entityDirType === 'couple' ? ((orgAttrs[COUPLE_ATTR.partner_a_email] as string) ?? null)
    : null;
  const personPhone: string | null =
    _entityDirType === 'person' ? ((orgAttrs[INDIVIDUAL_ATTR.phone] as string) ?? null) : null;
  const couplePartnerBEmail: string | null =
    _entityDirType === 'couple' ? ((orgAttrs[COUPLE_ATTR.partner_b_email] as string) ?? null) : null;
  const couplePartnerAName: string | null =
    _entityDirType === 'couple'
      ? ([orgAttrs[COUPLE_ATTR.partner_a_first] as string | null, orgAttrs[COUPLE_ATTR.partner_a_last] as string | null].filter(Boolean).join(' ') || null)
      : null;
  const couplePartnerBName: string | null =
    _entityDirType === 'couple'
      ? ([orgAttrs[COUPLE_ATTR.partner_b_first] as string | null, orgAttrs[COUPLE_ATTR.partner_b_last] as string | null].filter(Boolean).join(' ') || null)
      : null;
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
        : relType === 'venue' || relType === 'venue partner'
          ? 'vendor'
          : 'partner';

  // Crew: cortex-first (ROSTER_MEMBER edges on target org)
  let crew: NodeDetail['crew'] = [];
  const sys = getSystemClient();

  if (targetEntityIdForCrew) {
    const { data: crewRels } = await (sys as any)
      .schema('cortex').from('relationships')
      .select('id, source_entity_id, context_data')
      .eq('target_entity_id', targetEntityIdForCrew)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .limit(500) as { data: { id: string; source_entity_id: string; context_data: unknown }[] | null };

    if (crewRels?.length) {
      const personEntIds = [...new Set(crewRels.map((r) => r.source_entity_id))];
      const { data: personEnts } = await (sys as any)
        .schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes')
        .in('id', personEntIds) as { data: { id: string; display_name: string | null; avatar_url: string | null; attributes: unknown }[] | null };
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
          (attrs[PERSON_ATTR.email] as string | null) ||
          'Contact';
        return {
          id: r.id,
          name,
          email: (attrs[PERSON_ATTR.email] as string | null) ?? null,
          role: (ctx.role as string | null) ?? null,
          jobTitle: (attrs[PERSON_ATTR.job_title] as string | null) ?? (ctx.job_title as string | null) ?? null,
          avatarUrl: personEnt?.avatar_url ?? null,
          phone: (attrs[PERSON_ATTR.phone] as string | null) ?? null,
        };
      });
    }
  }

  // Active events where this entity is the client
  const { data: eventsData } = await supabase
    .schema('ops').from('events')
    .select('title')
    .eq('client_entity_id', cortexExtRel.target_entity_id)
    .limit(5);
  const active_events = (eventsData ?? []).map((e) => e.title ?? '').filter(Boolean);

  // Balance: inbound (invoices billed to this entity) + outbound (expenses paid to this entity)
  // finance schema may not be PostgREST-exposed — guard with try/catch
  const targetEntityId = cortexExtRel.target_entity_id;
  let balance = { inbound: 0, outbound: 0 };
  try {
    const [invoicesResult, expensesResult] = await Promise.all([
      supabase.schema('finance').from('invoices')
        .select('total_amount, status')
        .eq('bill_to_entity_id', targetEntityId),
      supabase.schema('ops').from('event_expenses')
        .select('amount')
        .eq('vendor_entity_id', targetEntityId),
    ]);
    const inbound = (invoicesResult.data ?? [])
      .filter((inv) => inv.status !== 'void')
      .reduce((sum, inv) => sum + Number(inv.total_amount ?? 0), 0);
    const outbound = (expensesResult.data ?? [])
      .reduce((sum, exp) => sum + Number((exp.amount as number) ?? 0), 0);
    balance = { inbound, outbound };
  } catch {
    // finance schema not exposed or query failed — default to zero
  }

  // Partner computed metrics: show count + last active date
  let partnerShowCount: number | null = null;
  let lastActiveDate: string | null = null;
  try {
    const [countResult, lastResult] = await Promise.all([
      supabase.schema('ops').from('events')
        .select('id', { count: 'exact', head: true })
        .or(`client_entity_id.eq.${targetEntityId},venue_entity_id.eq.${targetEntityId}`),
      supabase.schema('ops').from('events')
        .select('starts_at')
        .or(`client_entity_id.eq.${targetEntityId},venue_entity_id.eq.${targetEntityId}`)
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    partnerShowCount = countResult.count ?? null;
    lastActiveDate = (lastResult.data?.starts_at as string | null) ?? null;
  } catch {
    // ops schema query failed — leave null
  }

  // Lifetime value: inbound for clients, outbound for vendors
  const lifetimeValue: number | null =
    direction === 'client' ? (balance.inbound || null) :
    direction === 'vendor' ? (balance.outbound || null) :
    ((balance.inbound + balance.outbound) || null);

  return {
    id: relId,
    kind: 'external_partner',
    identity: {
      name: orgEntity?.display_name ?? 'Unknown',
      avatarUrl: orgEntity?.avatar_url ?? null,
      label: typeLabel,
    },
    direction,
    relationshipTypeRaw: relType,
    balance,
    active_events,
    notes: relNotes,
    relationshipId: relId,
    isGhost,
    targetOrgId: targetOrgIdLegacy,
    orgSlug: orgEntity?.handle ?? null,
    orgLogoUrl: orgEntity?.avatar_url ?? null,
    orgBrandColor: (orgAttrs[COMPANY_ATTR.brand_color] as string | null) ?? null,
    orgWebsite: (orgAttrs[COMPANY_ATTR.website] as string | null) ?? null,
    crew,
    orgSupportEmail: (orgAttrs[COMPANY_ATTR.support_email] as string | null) ?? null,
    orgAddress: (orgAttrs[COMPANY_ATTR.address] as NodeDetail['orgAddress']) ?? null,
    orgDefaultCurrency: (orgAttrs[COMPANY_ATTR.default_currency] as string | null) ?? null,
    orgCategory: (orgAttrs[COMPANY_ATTR.category] as string | null) ?? null,
    orgOperationalSettings: (orgAttrs[COMPANY_ATTR.operational_settings] as Record<string, unknown> | null) ?? null,
    relationshipTier: relTier,
    relationshipTags: relTags,
    lifecycleStatus: relLifecycleStatus ?? null,
    blacklistReason: relBlacklistReason,
    subjectEntityId: cortexExtRel.target_entity_id,
    entityDirectoryType: _entityDirType,
    personEmail,
    personPhone,
    couplePartnerBEmail,
    couplePartnerAName,
    couplePartnerBName,
    orgVenueSpecs: orgEntity ? (() => {
      const vAttrs = (orgEntity!.attributes as Record<string, unknown> | null) ?? {};
      return {
        capacity: typeof vAttrs[VENUE_ATTR.capacity] === 'number' ? vAttrs[VENUE_ATTR.capacity] as number : null,
        load_in_notes: typeof vAttrs[VENUE_ATTR.load_in_notes] === 'string' ? vAttrs[VENUE_ATTR.load_in_notes] as string : null,
        power_notes: typeof vAttrs[VENUE_ATTR.power_notes] === 'string' ? vAttrs[VENUE_ATTR.power_notes] as string : null,
        stage_notes: typeof vAttrs[VENUE_ATTR.stage_notes] === 'string' ? vAttrs[VENUE_ATTR.stage_notes] as string : null,
      };
    })() : null,
    lifetimeValue,
    lastActiveDate,
    partnerShowCount,
    relationshipStrength: computeRelationshipStrength(
      partnerShowCount,
      lastActiveDate,
      lifetimeValue,
    ),
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
    `ghost-${crypto.randomUUID()}@unusonic.local`;
  const role = (payload.role ? String(payload.role).trim() : null) ?? 'member';
  const jobTitle = payload.jobTitle ? String(payload.jobTitle).trim() || null : null;

  // Use add_contact_to_ghost_org RPC (already migrated to directory + cortex)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_contact_to_ghost_org', {
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

  // RPC returns jsonb { ok, error } — check the payload, not just the Postgres error
  const rpcPayload = rpcResult as { ok?: boolean; error?: string } | null;
  if (rpcPayload && rpcPayload.ok === false) {
    return { ok: false, error: rpcPayload.error ?? 'Failed to add to crew.' };
  }

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
    const emailVal = emailRaw || `ghost-${crypto.randomUUID()}@unusonic.local`;
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
