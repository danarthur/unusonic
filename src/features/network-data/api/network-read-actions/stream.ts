/**
 * Network Orbit – getNetworkStream: unified Core + Inner Circle + Outer Orbit.
 * @module features/network-data/api/network-read-actions/stream
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { NetworkNode } from '@/entities/network';
import { mergeNodesByEntity } from './merge-nodes';
import { PERSON_ATTR } from '../../model/attribute-keys';
import {
  fetchStarredEntityIds,
  withStars,
  withCrewRoles,
  readContactEmail,
  resolveNodeLabel,
  indexCrewSkills,
  indexByEntity,
  sumBy,
  countBy,
  attachAffiliations,
  fetchWorkedWithNodes,
} from './stream-helpers';
import { readEntityRegion } from '@/entities/directory/model/read-region';
import { readRate } from '@/entities/directory/model/read-rate';
import { attachShowDates } from './show-dates';
import { ROLE_ORDER, getCurrentEntityAndOrg } from '../network-helpers';

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
    .select('id, owner_workspace_id').eq('legacy_org_id', orgId).maybeSingle();
  if (!orgDirEnt) return [];

  // Verify caller is a member of the requested org (cortex check)
  const { data: callerMembership } = await supabase
    .schema('cortex').from('relationships')
    .select('id').eq('source_entity_id', entityId).eq('target_entity_id', orgDirEnt.id)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']).is('ended_at', null).maybeSingle();

  if (!callerMembership && resolvedOrgId !== orgId) return [];

  // Fetch all ROSTER_MEMBER edges (team) and preferred partner edges (inner circle) in parallel
  const [rosterRes, partnerRes] = await Promise.all([
    supabase.schema('cortex').from('relationships')
      .select('id, source_entity_id, context_data, created_at')
      .eq('target_entity_id', orgDirEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER')
      // Live edges only; ended ones are history.
      .is('ended_at', null),
    supabase.schema('cortex').from('relationships')
      .select('id, target_entity_id, relationship_type, context_data, created_at')
      .eq('source_entity_id', orgDirEnt.id)
      .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT', 'VENUE_PARTNER'])
      // Live edges only; ended ones are history.
      .is('ended_at', null),
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

  const [personEntRes, partnerEntRes, invoicesRes, expensesRes, crewSkillsRes, referralCountRes, capabilitiesRes] = await Promise.all([
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
    // The other direction: expenses recorded against them that we have not
    // paid. Kept separate from the receivable, never netted against it.
    allPartnerEntityIds.length > 0
      ? supabase.schema('ops').from('event_expenses')
          .select('vendor_entity_id, amount')
          .in('vendor_entity_id', allPartnerEntityIds)
          .eq('workspace_id', orgId)
          .is('paid_at', null)
      : { data: [] as { vendor_entity_id: string; amount: number }[] },
    // Crew skills from ops.crew_skills (source of truth)
    allPersonEntityIds.length > 0
      ? supabase.schema('ops').from('crew_skills')
          .select('entity_id, skill_tag, role_tag')
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

  const { crewSkillsByEntityId, crewRolesByEntityId } = indexCrewSkills(crewSkillsRes.data);
  const capabilitiesByEntityId = indexByEntity(capabilitiesRes.data, 'capability');
  const balanceMap = sumBy(invoicesRes.data, 'bill_to_entity_id', 'total_amount');
  const payableMap = sumBy(expensesRes.data, 'vendor_entity_id', 'amount');
  const referralCountMap = countBy(referralCountRes.data, 'referrer_entity_id');

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
    const rate = readRate(attrs);
    return {
      id: edge.id,
      entityId: edge.source_entity_id,
      kind: isExternal ? 'extended_team' : 'internal_employee',
      gravity: 'core',
      relationshipType: 'ROSTER_MEMBER',
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
        region: market,
        rate,
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
    const payable = payableMap.get(edge.target_entity_id) ?? 0;
    const refCount = referralCountMap.get(edge.target_entity_id) ?? 0;
    const entityType = (partner?.type as 'person' | 'company' | 'venue' | 'couple') ?? undefined;
    const attrs = (partner?.attributes as Record<string, unknown>) ?? {};
    const relType = edge.relationship_type as NetworkNode['relationshipType'];
    const email = readContactEmail(entityType, attrs);
    const rate = readRate(attrs);
    // Only persons on PARTNER / VENDOR edges act as "freelancers" with a
    // job-title-based roleGroup. CLIENT-edge persons are wedding hosts or
    // individual clients and should NOT be grouped with crew.
    const isClientPerson = entityType === 'person' && relType === 'CLIENT';
    const personJobTitle =
      entityType === 'person' && !isClientPerson
        ? (attrs[PERSON_ATTR.job_title] as string | null) ?? null
        : null;
    const label = resolveNodeLabel(relType, entityType, personJobTitle, cortexTypeToLabel(edge.relationship_type));
    return {
      id: edge.id,
      entityId: edge.target_entity_id,
      kind: 'external_partner',
      gravity: 'inner_circle',
      relationshipType: relType,
      identity: {
        name: partner?.display_name ?? 'Unknown',
        // Was hard-coded null, so a preferred partner -- the people most likely
        // to have a photo on file -- was the one group that never showed one.
        avatarUrl: partner?.avatar_url ?? null,
        label,
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
        ...(payable > 0 ? { payable_balance: payable } : {}),
        ...(refCount > 0 ? { referral_count: refCount } : {}),
        region: readEntityRegion(entityType, attrs),
        rate,
        connectedSince: (edge as { created_at?: string }).created_at ?? undefined,
      },
    };
  }).sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  const outerOrbitNodes: NetworkNode[] = outerOrbitEdges.map((rel): NetworkNode => {
    const ctx = (rel.context_data as Record<string, unknown>) ?? {};
    const partnerEnt = partnerEntMap.get(rel.target_entity_id);
    const balance = balanceMap.get(rel.target_entity_id) ?? 0;
    const payable = payableMap.get(rel.target_entity_id) ?? 0;
    const refCount = referralCountMap.get(rel.target_entity_id) ?? 0;

    // Use the edge column as the canonical type source — context_data.relationship_type
    // is not a defined cortex field and should not influence labels.
    const typeLabel = cortexTypeToLabel(rel.relationship_type);
    const entityType = (partnerEnt?.type as 'person' | 'company' | 'venue' | 'couple') ?? undefined;
    const attrs = (partnerEnt?.attributes as Record<string, unknown>) ?? {};
    const email = readContactEmail(entityType, attrs);

    return {
      id: rel.id,
      entityId: rel.target_entity_id,
      kind: 'external_partner' as const,
      gravity: 'outer_orbit' as const,
      relationshipType: rel.relationship_type as NetworkNode['relationshipType'],
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
        ...(payable > 0 ? { payable_balance: payable } : {}),
        ...(refCount > 0 ? { referral_count: refCount } : {}),
        region: readEntityRegion(entityType, attrs),
        connectedSince: (rel as { created_at?: string }).created_at ?? undefined,
      },
    };
  }).sort((a, b) => a.identity.name.localeCompare(b.identity.name));

  // Stars are per-user, so they are attached after the shared node set is built.
  const starredIds = await fetchStarredEntityIds(
    supabase,
    (orgDirEnt as { owner_workspace_id?: string | null }).owner_workspace_id ?? null,
  );

  const edgeNodes = [
    ...coreNodes,
    ...extendedTeamNodes,
    ...innerCircleNodes,
    ...outerOrbitNodes,
  ];

  // People with real deal history whom nobody filed with an edge. Added after
  // the edge-built set so an explicit relationship always wins over an inferred
  // one, and so nobody appears twice.
  const workedWith = await fetchWorkedWithNodes(
    supabase,
    (orgDirEnt as { owner_workspace_id?: string | null }).owner_workspace_id ?? null,
    new Set(edgeNodes.map((n) => n.entityId)),
  );

  const merged = withCrewRoles(crewRolesByEntityId, withStars(starredIds,
    mergeNodesByEntity([...edgeNodes, ...workedWith])));

  // Last worked / next booked, on the final merged set so a person reached
  // through their company gets dates too.
  const dated = await attachShowDates(supabase, orgId, merged);

  // Last, so it sees the final merged node set and can attach an employer to a
  // person node and the matching people to the company node in one pass.
  return attachAffiliations(supabase, dated);
}

/** Entity ids the signed-in user has starred in this workspace. */
