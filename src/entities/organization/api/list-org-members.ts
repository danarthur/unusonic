'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { OrgMemberRosterItem, EmploymentStatus, OrgMemberRole } from '../model/types';

/**
 * List ROSTER_MEMBER edges for an organization (roster), including Ghosts.
 * Data source: cortex.relationships + directory.entities (Session 10 migration).
 * RLS: only workspace members see these entities.
 */
export async function listOrgMembers(orgId: string): Promise<OrgMemberRosterItem[]> {
  const supabase = await createClient();

  // 1. Resolve org's directory entity by legacy_org_id
  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!orgEnt?.id) return [];

  // 2. Query ROSTER_MEMBER edges targeting the org entity
  const { data: rels, error: relsError } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, context_data, created_at')
    .eq('target_entity_id', orgEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .order('created_at', { ascending: false });
  if (relsError || !rels?.length) return [];

  // Filter out soft-deleted edges in JS (JSONB null checks not supported in JS client filter)
  const activeRels = rels.filter((r) => {
    const ctx = r.context_data as Record<string, unknown> | null;
    return ctx?.deleted_at == null;
  });
  if (!activeRels.length) return [];

  // 3. Collect source entity IDs
  const sourceEntityIds = [...new Set(activeRels.map((r) => r.source_entity_id))];

  // 4. Batch-fetch directory entities
  const { data: dirEnts } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url, claimed_by_user_id, attributes')
    .in('id', sourceEntityIds);
  const dirEntById = new Map((dirEnts ?? []).map((e) => [e.id, e]));

  // 5. Best-effort skills via legacy org_member_id references in context_data
  const legacyMemberIds = activeRels
    .map((r) => (r.context_data as Record<string, unknown>)?.org_member_id as string | undefined)
    .filter((id): id is string => Boolean(id));
  const skillsByLegacyId = new Map<string, string[]>();
  if (legacyMemberIds.length > 0) {
    const { data: skillRows } = await supabase
      .from('talent_skills')
      .select('org_member_id, skill_tag')
      .in('org_member_id', legacyMemberIds);
    for (const row of skillRows ?? []) {
      const existing = skillsByLegacyId.get(row.org_member_id) ?? [];
      existing.push(row.skill_tag);
      skillsByLegacyId.set(row.org_member_id, existing);
    }
  }

  // 6. Map each relationship to OrgMemberRosterItem
  const items: OrgMemberRosterItem[] = [];
  for (const rel of activeRels) {
    const dirEnt = dirEntById.get(rel.source_entity_id);
    if (!dirEnt) continue; // orphaned edge — skip

    const ctx = (rel.context_data as Record<string, unknown>) ?? {};
    const attrs = (dirEnt.attributes as Record<string, unknown>) ?? {};

    const first_name =
      (ctx.first_name as string | undefined) ?? (attrs.first_name as string | undefined) ?? null;
    const last_name =
      (ctx.last_name as string | undefined) ?? (attrs.last_name as string | undefined) ?? null;
    const job_title =
      (ctx.job_title as string | undefined) ?? (attrs.job_title as string | undefined) ?? null;
    const employment_status = ((ctx.employment_status as string | undefined) ?? 'internal_employee') as EmploymentStatus;
    const role = ((ctx.role as string | undefined) ?? 'member') as OrgMemberRole;
    const email = (attrs.email as string | undefined) ?? dirEnt.display_name ?? '';
    const is_ghost = dirEnt.claimed_by_user_id == null;
    const display_name =
      [first_name, last_name].filter(Boolean).join(' ').trim() ||
      dirEnt.display_name ||
      (attrs.email as string | undefined) ||
      '';
    const legacyMemberId = ctx.org_member_id as string | undefined;
    const skill_tags = legacyMemberId ? (skillsByLegacyId.get(legacyMemberId) ?? []) : [];

    items.push({
      id: rel.id,
      org_id: orgId,
      entity_id: rel.source_entity_id,
      profile_id: dirEnt.claimed_by_user_id ?? null,
      first_name,
      last_name,
      job_title,
      employment_status,
      role,
      email,
      is_ghost,
      display_name,
      skill_tags,
      avatar_url: dirEnt.avatar_url ?? null,
    });
  }

  return items;
}
