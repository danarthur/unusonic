/**
 * Network Orbit – Read/query actions: stream, search, node details.
 * @module features/network-data/api/network-read-actions
 */

'use server';

import 'server-only';
import { unstable_noStore } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { NetworkNode } from '@/entities/network';
import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR, COUPLE_ATTR, INDIVIDUAL_ATTR } from '../model/attribute-keys';
import { ROLE_ORDER, getCurrentEntityAndOrg } from './network-helpers';

// ---------------------------------------------------------------------------
// getNetworkStream
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// searchNetworkOrgs
// ---------------------------------------------------------------------------

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
  /**
   * Relationship id (cortex.relationships.id) — used by existing write paths
   * like addContactToGhostOrg. NOT a directory.entities id; do NOT route on it.
   */
  id: string;
  /**
   * The person's actual directory.entities id. Use this for navigation
   * (e.g. `/network/entity/{subjectEntityId}`). May be null only for
   * synthetic rows (optimistic pending adds before the server refetches).
   */
  subjectEntityId: string | null;
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
          subjectEntityId: r.source_entity_id,
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
