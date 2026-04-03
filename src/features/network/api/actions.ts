/**
 * Network Manager – Server Actions for graph data, invitation validation, and private notes.
 * Session 9: fully migrated to directory.entities + cortex.relationships.
 * @module features/network/api/actions
 */

'use server';

import 'server-only';
import { unstable_noStore, revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import type { NetworkGraph, ValidateInvitationResult } from '../model/types';
import { COMPANY_ATTR, PERSON_ATTR } from '@/features/network-data/model/attribute-keys';

const CURRENT_ORG_COOKIE = 'unusonic_current_org_id';

const ORG_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  member: 3,
  restricted: 4,
};

/**
 * Resolve current user's entity (directory.entities) and their HQ org.
 * Returns directory.entities.id for entityId, and legacy_org_id for orgId.
 */
async function getCurrentEntityAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { entityId: null, orgId: null };

  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!entity) return { entityId: null, orgId: null };

  // Get their org memberships from cortex.relationships
  const { data: rels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', entity.id)
    .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER']);

  if (rels?.length) {
    const sorted = [...rels].sort(
      (a, b) =>
        (ORG_ROLE_PRIORITY[(a.context_data as Record<string, string>)?.role] ?? 99) -
        (ORG_ROLE_PRIORITY[(b.context_data as Record<string, string>)?.role] ?? 99)
    );
    const orgEntityId = sorted[0].target_entity_id;
    const { data: orgEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('legacy_org_id')
      .eq('id', orgEntityId)
      .maybeSingle();
    if (orgEntity?.legacy_org_id) {
      return { entityId: entity.id, orgId: orgEntity.legacy_org_id as string };
    }
  }

  return { entityId: entity.id, orgId: null };
}

/**
 * Resolves the current user's HQ org ID.
 * Returns legacy_org_id UUID (used in all operational tables).
 */
export async function getCurrentOrgId(): Promise<string | null> {
  unstable_noStore();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();

  if (entity) {
    const cookieStore = await cookies();
    const lastOrg = cookieStore.get(CURRENT_ORG_COOKIE)?.value;

    // Try cookie org first (validate membership still exists)
    if (lastOrg?.trim()) {
      const { data: cookieOrgEntity } = await supabase
        .schema('directory')
        .from('entities')
        .select('id')
        .eq('legacy_org_id', lastOrg.trim())
        .maybeSingle();

      if (cookieOrgEntity) {
        const { data: cookieMembership } = await supabase
          .schema('cortex')
          .from('relationships')
          .select('id')
          .eq('source_entity_id', entity.id)
          .eq('target_entity_id', cookieOrgEntity.id)
          .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
          .maybeSingle();
        if (cookieMembership) return lastOrg.trim();
      }
    }

    // Resolve HQ via cortex.relationships
    const { data: rels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id, context_data')
      .eq('source_entity_id', entity.id)
      .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER']);

    if (rels?.length) {
      const sorted = [...rels].sort(
        (a, b) =>
          (ORG_ROLE_PRIORITY[(a.context_data as Record<string, string>)?.role] ?? 99) -
          (ORG_ROLE_PRIORITY[(b.context_data as Record<string, string>)?.role] ?? 99)
      );
      const { data: orgEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('legacy_org_id')
        .eq('id', sorted[0].target_entity_id)
        .maybeSingle();
      if (orgEnt?.legacy_org_id) return orgEnt.legacy_org_id as string;
    }
  }

  // Fallback: organization_members (workspace-based onboarding path)
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (membership?.organization_id) return membership.organization_id;

  return null;
}

/**
 * Resolve current user's directory entity id.
 * Returns directory.entities.id.
 */
export async function getCurrentEntityId(): Promise<string | null> {
  unstable_noStore();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  return entity?.id ?? null;
}

/** Call from pages when you have a valid currentOrgId so it can be restored after nav. */
export async function setCurrentOrgCookie(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });
}

/**
 * Fetch the network graph scoped to current_org_id.
 * Session 9: reads from directory.entities + cortex.relationships only.
 */
export async function getNetworkGraph(
  current_org_id: string
): Promise<NetworkGraph | null> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== current_org_id) {
    return null;
  }

  // Get current org entity
  const { data: currentOrgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, handle, attributes, avatar_url, owner_workspace_id')
    .eq('legacy_org_id', current_org_id)
    .maybeSingle();

  if (!currentOrgEnt) {
    return { current_org_id, organizations: [], entities: [] };
  }

  // Get all org entities linked to current org via any org-level relationship
  // Plus the current org itself
  const { data: partnerRels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('target_entity_id, relationship_type, context_data')
    .eq('source_entity_id', currentOrgEnt.id)
    .in('relationship_type', ['PARTNER', 'VENDOR', 'VENUE_PARTNER', 'CLIENT']);

  const linkedOrgEntityIds = [currentOrgEnt.id, ...(partnerRels ?? []).map((r) => r.target_entity_id)];
  const uniqueOrgEntityIds = [...new Set(linkedOrgEntityIds)];

  // Get all org entities
  const { data: orgEntities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, handle, attributes, avatar_url, legacy_org_id, owner_workspace_id')
    .in('id', uniqueOrgEntityIds);

  const orgEntityMap = new Map((orgEntities ?? []).map((e) => [e.id, e]));

  // Private data (org_private_data is still in public schema)
  const legacyOrgIds = (orgEntities ?? [])
    .map((e) => e.legacy_org_id)
    .filter(Boolean) as string[];

  const { data: privateData } = legacyOrgIds.length > 0
    ? await supabase
        .from('org_private_data')
        .select('subject_org_id, private_notes, internal_rating')
        .eq('owner_org_id', current_org_id)
        .in('subject_org_id', legacyOrgIds)
    : { data: [] };

  const privateByLegacyOrgId = new Map(
    (privateData ?? []).map((p) => [p.subject_org_id, p])
  );

  // Get all MEMBER/ROSTER_MEMBER relationships for these org entities
  const { data: memberRels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .in('target_entity_id', uniqueOrgEntityIds)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']);

  // Deduplicate: prefer ROSTER_MEMBER over MEMBER for same person+org
  type MemberRel = NonNullable<typeof memberRels>[number];
  const memberRelByKey = new Map<string, MemberRel>();
  for (const rel of memberRels ?? []) {
    const key = `${rel.source_entity_id}:${rel.target_entity_id}`;
    const existing = memberRelByKey.get(key);
    if (!existing || rel.relationship_type === 'ROSTER_MEMBER') {
      memberRelByKey.set(key, rel);
    }
  }
  const deduped = [...memberRelByKey.values()];

  const personEntityIds = [...new Set(deduped.map((r) => r.source_entity_id))];

  // Get person entities
  const { data: personEntities } = personEntityIds.length > 0
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, attributes, avatar_url, claimed_by_user_id')
        .in('id', personEntityIds)
    : { data: [] };

  const personEntityMap = new Map((personEntities ?? []).map((e) => [e.id, e]));

  // Get skills via stored org_member_id in ROSTER_MEMBER context_data
  const orgMemberIds = deduped
    .filter((r) => r.relationship_type === 'ROSTER_MEMBER')
    .map((r) => (r.context_data as Record<string, string>)?.org_member_id)
    .filter(Boolean) as string[];

  const { data: skillRows } = orgMemberIds.length > 0
    ? await supabase
        .from('talent_skills')
        .select('org_member_id, skill_tag')
        .in('org_member_id', orgMemberIds)
    : { data: [] };

  const skillsByOrgMemberId = new Map<string, string[]>();
  for (const s of skillRows ?? []) {
    const list = skillsByOrgMemberId.get(s.org_member_id) ?? [];
    list.push(s.skill_tag);
    skillsByOrgMemberId.set(s.org_member_id, list);
  }

  // Build a map from relationship_id to skill_tags (via org_member_id in context_data)
  const skillsByRelId = new Map<string, string[]>();
  for (const rel of deduped) {
    if (rel.relationship_type !== 'ROSTER_MEMBER') continue;
    const omId = (rel.context_data as Record<string, string>)?.org_member_id;
    if (omId) skillsByRelId.set(rel.id, skillsByOrgMemberId.get(omId) ?? []);
  }

  // Group rels by org entity
  const relsByOrgEntityId = new Map<string, typeof deduped>();
  for (const rel of deduped) {
    const list = relsByOrgEntityId.get(rel.target_entity_id) ?? [];
    list.push(rel);
    relsByOrgEntityId.set(rel.target_entity_id, list);
  }

  // Build organizations list
  const organizations: NetworkGraph['organizations'] = uniqueOrgEntityIds.map((orgEntityId) => {
    const orgEnt = orgEntityMap.get(orgEntityId);
    if (!orgEnt) return null;
    const attrs = (orgEnt.attributes as Record<string, unknown>) ?? {};
    const legacyOrgId = orgEnt.legacy_org_id as string | null;
    const priv = legacyOrgId ? privateByLegacyOrgId.get(legacyOrgId) : null;
    const orgRels = relsByOrgEntityId.get(orgEntityId) ?? [];

    const roster = orgRels
      .map((rel) => {
        const person = personEntityMap.get(rel.source_entity_id);
        if (!person) return null;
        const ctx = (rel.context_data as Record<string, unknown>) ?? {};
        const personAttrs = (person.attributes as Record<string, unknown>) ?? {};
        const skill_tags = rel.relationship_type === 'ROSTER_MEMBER'
          ? (skillsByRelId.get(rel.id) ?? [])
          : [];
        return {
          id: person.id,
          email: (personAttrs[PERSON_ATTR.email] as string) ?? null,
          is_ghost: person.claimed_by_user_id == null,
          role_label: (ctx.role_label ?? ctx.job_title ?? null) as string | null,
          access_level: (ctx.access_level ?? 'member') as 'admin' | 'member' | 'read_only',
          organization_ids: [legacyOrgId ?? orgEntityId],
          skill_tags,
          org_member_id: rel.id,
        };
      })
      .filter(Boolean) as NetworkGraph['organizations'][0]['roster'];

    return {
      id: legacyOrgId ?? orgEntityId,
      name: orgEnt.display_name,
      slug: orgEnt.handle ?? null,
      is_claimed: (attrs[COMPANY_ATTR.is_claimed] as boolean) ?? true,
      claimed_at: null,
      created_by_org_id: (attrs[COMPANY_ATTR.created_by_org_id] as string | null) ?? null,
      category: (attrs[COMPANY_ATTR.category] as NetworkGraph['organizations'][0]['category']) ?? null,
      private_notes: priv?.private_notes ?? null,
      internal_rating: priv?.internal_rating ?? null,
      roster,
    };
  }).filter(Boolean) as NetworkGraph['organizations'];

  // Build entities list (deduplicated people with all their org affiliations)
  const entityOrgIds = new Map<string, string[]>();
  for (const rel of deduped) {
    const orgEnt = orgEntityMap.get(rel.target_entity_id);
    const orgId = (orgEnt?.legacy_org_id as string | null) ?? rel.target_entity_id;
    const list = entityOrgIds.get(rel.source_entity_id) ?? [];
    if (!list.includes(orgId)) list.push(orgId);
    entityOrgIds.set(rel.source_entity_id, list);
  }

  const orgNameById = new Map(
    (orgEntities ?? []).map((o) => [o.legacy_org_id as string, o.display_name])
  );

  const entities: NetworkGraph['entities'] = personEntityIds.map((personEntityId) => {
    const person = personEntityMap.get(personEntityId);
    if (!person) return null;
    const personAttrs = (person.attributes as Record<string, unknown>) ?? {};
    // (PERSON_ATTR used below for email — person entities store email at PERSON_ATTR.email)
    const orgIds = entityOrgIds.get(personEntityId) ?? [];
    const orgNames = orgIds.map((id) => orgNameById.get(id) ?? '').filter(Boolean);

    const allSkills = new Set<string>();
    for (const rel of deduped.filter((r) => r.source_entity_id === personEntityId && r.relationship_type === 'ROSTER_MEMBER')) {
      (skillsByRelId.get(rel.id) ?? []).forEach((t) => allSkills.add(t));
    }

    // Find the best relationship for role/access info
    const primaryRel = deduped.find(
      (r) => r.source_entity_id === personEntityId && r.target_entity_id === currentOrgEnt.id
    ) ?? deduped.find((r) => r.source_entity_id === personEntityId);
    const ctx = (primaryRel?.context_data as Record<string, unknown>) ?? {};

    return {
      id: person.id,
      email: (personAttrs[PERSON_ATTR.email] as string) ?? null,
      is_ghost: person.claimed_by_user_id == null,
      role_label: (ctx.role_label ?? ctx.job_title ?? null) as string | null,
      access_level: (ctx.access_level ?? 'member') as 'admin' | 'member' | 'read_only',
      organization_ids: orgIds,
      organization_names: orgNames,
      skill_tags: [...allSkills],
      org_member_id: primaryRel?.id ?? null,
    };
  }).filter(Boolean) as NetworkGraph['entities'];

  return { current_org_id, organizations, entities };
}

/**
 * Validate an invitation token (for the claim page).
 */
export async function validateInvitation(
  token: string
): Promise<ValidateInvitationResult> {
  if (!token?.trim()) return { ok: false, error: 'Missing token.' };
  const supabase = await createClient();
  const { data: inv, error } = await supabase
    .from('invitations')
    .select('id, organization_id, email, status, expires_at, payload')
    .eq('token', token.trim())
    .maybeSingle();
  if (error || !inv) return { ok: false, error: 'Invalid or expired invitation.' };
  if (inv.status !== 'pending')
    return { ok: false, error: 'This invitation has already been used.' };
  if (new Date(inv.expires_at) <= new Date())
    return { ok: false, error: 'This invitation has expired.' };

  // Try payload first (works for anon users), then directory lookup (needs auth)
  const payloadOrgName = (inv.payload as { orgName?: string } | null)?.orgName ?? null;
  let orgName = payloadOrgName;
  if (!orgName) {
    const { data: orgEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('legacy_org_id', inv.organization_id)
      .maybeSingle();
    orgName = orgEnt?.display_name ?? null;
  }

  return {
    ok: true,
    email: inv.email,
    org_name: orgName ?? 'Organization',
    organization_id: inv.organization_id,
  };
}

/**
 * Update private notes for an org.
 */
export async function updatePrivateNotes(
  subject_org_id: string,
  private_notes: string | null,
  internal_rating: number | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

  const payload = {
    subject_org_id,
    owner_org_id: orgId,
    private_notes: private_notes ?? null,
    internal_rating: internal_rating ?? null,
  };

  const { error } = await supabase.from('org_private_data').upsert(payload, {
    onConflict: 'subject_org_id,owner_org_id',
    ignoreDuplicates: false,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/crm');
  revalidatePath('/network');
  return { ok: true };
}
