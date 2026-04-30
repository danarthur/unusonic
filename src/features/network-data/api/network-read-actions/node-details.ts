/**
 * Network Orbit – getNetworkNodeDetails: deep context for the Glass Slide-Over.
 * @module features/network-data/api/network-read-actions/node-details
 */

'use server';

import 'server-only';
import { unstable_noStore } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR, COUPLE_ATTR, INDIVIDUAL_ATTR } from '../../model/attribute-keys';
import { getCurrentEntityAndOrg } from '../network-helpers';
import type { NodeDetail } from './types';

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
    const { data: crewRels } = await sys
      .schema('cortex').from('relationships')
      .select('id, source_entity_id, context_data')
      .eq('target_entity_id', targetEntityIdForCrew)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .limit(500) as { data: { id: string; source_entity_id: string; context_data: unknown }[] | null };

    if (crewRels?.length) {
      const personEntIds = [...new Set(crewRels.map((r) => r.source_entity_id))];
      const { data: personEnts } = await sys
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
