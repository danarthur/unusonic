'use server';

/**
 * Crew search and roster-listing server actions.
 *
 * Extracted from deal-crew.ts (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - searchCrewMembers — surfaces ROSTER_MEMBER person entities first
 *     ("Your team"), then falls back to inner-circle PARTNER/VENDOR/CLIENT
 *     edges with tier='preferred' ("Network"). Used by the "Add crew"
 *     picker in ProductionTeamCard. Do NOT use the network-search action
 *     for crew — it excludes ROSTER_MEMBER entities.
 *   - listDealRoster — returns every active ROSTER_MEMBER person (the
 *     people the workspace books). Intentionally excludes the broader
 *     PARTNER/VENDOR/CLIENT graph — those aren't pools we book as crew.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { instrument } from '@/shared/lib/instrumentation';
import type { CrewSearchResult } from './types';

export async function searchCrewMembers(
  orgId: string,
  query: string,
  /** When set, returns crew whose job_title or skills match this role — even if query is empty. */
  roleFilter?: string | null,
): Promise<CrewSearchResult[]> {
  return instrument('searchCrewMembers', async () => {
    const parsed = z.object({
      orgId: z.string().uuid(),
      query: z.string().max(200),
    }).safeParse({ orgId, query });
    if (!parsed.success) return [];
    const hasRoleFilter = !!roleFilter?.trim();

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return [];

    const supabase = await createClient();
    const q = query.trim();
    const roleLower = roleFilter?.trim().toLowerCase() ?? '';
    // When no text query and no role filter, nothing to search
    if (!q && !hasRoleFilter) return [];

    // ── 1. Resolve the workspace's company entity ────────────────────────────
    const { data: orgEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('legacy_org_id', orgId)
      .maybeSingle();
    if (!orgEnt?.id) return [];

    // ── 2. Team: ROSTER_MEMBER edges targeting the org entity ────────────────
    const { data: rosterRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('source_entity_id, context_data')
      .eq('target_entity_id', orgEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER');

    const activeRosterRels = (rosterRels ?? []).filter(
      (r) => !(r.context_data as Record<string, unknown>)?.deleted_at
    );
    const rosterEntityIds = activeRosterRels.map((r) => r.source_entity_id);
    const rosterCtxById = new Map(activeRosterRels.map((r) => [r.source_entity_id, r.context_data as Record<string, unknown>]));

    let teamResults: CrewSearchResult[] = [];
    // rosterUserIds: claimed_by_user_id for every roster member, used to deduplicate
    // network results (a user may have multiple directory entities with different names).
    const rosterUserIds = new Set<string>();

    // Fetch crew skills from ops.crew_skills (source of truth) — keyed by entity_id
    const crewSkillsByEntityId = new Map<string, string[]>();
    if (rosterEntityIds.length > 0) {
      // Fetch roster entities, crew skills, and equipment in parallel
      const [rosterEntResult, crewSkillsResult, crewEquipmentResult] = await Promise.all([
        supabase
          .schema('directory')
          .from('entities')
          .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
          .in('id', rosterEntityIds),
        supabase
          .schema('ops')
          .from('crew_skills')
          .select('entity_id, skill_tag')
          .in('entity_id', rosterEntityIds)
          .eq('workspace_id', workspaceId),
        supabase
          .schema('ops')
          .from('crew_equipment')
          .select('entity_id, name')
          .in('entity_id', rosterEntityIds)
          .eq('workspace_id', workspaceId),
      ]);

      const allRosterEntities = rosterEntResult.data ?? [];

      for (const row of crewSkillsResult.data ?? []) {
        const list = crewSkillsByEntityId.get(row.entity_id) ?? [];
        list.push(row.skill_tag);
        crewSkillsByEntityId.set(row.entity_id, list);
      }

      const crewEquipmentByEntityId = new Map<string, string[]>();
      for (const row of crewEquipmentResult.data ?? []) {
        const list = crewEquipmentByEntityId.get(row.entity_id) ?? [];
        list.push(row.name);
        crewEquipmentByEntityId.set(row.entity_id, list);
      }

      for (const e of allRosterEntities) {
        if (e.claimed_by_user_id) rosterUserIds.add(e.claimed_by_user_id);
      }

      const qLower = q.toLowerCase();

      const teamEntities = allRosterEntities.filter((e) => {
        const ctx = rosterCtxById.get(e.id) ?? {};
        const jobTitle = ((ctx.job_title as string | null) ?? '').toLowerCase();
        const skills = (crewSkillsByEntityId.get(e.id) ?? []).map((s) => s.toLowerCase());

        // Role filter: match skills only — title is org identity, skills qualify for event roles
        if (hasRoleFilter) {
          const roleMatch = skills.some((s) => s.includes(roleLower) || roleLower.includes(s));
          if (q) {
            return roleMatch && (e.display_name?.toLowerCase().includes(qLower) ?? false);
          }
          return roleMatch;
        }
        // Text query only: name match
        return e.display_name?.toLowerCase().includes(qLower) ?? false;
      });

      teamResults = teamEntities.map((e) => {
        const attrs = readEntityAttrs(e.attributes, 'person');
        const ctx = rosterCtxById.get(e.id) ?? {};
        const name =
          [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() ||
          e.display_name;
        return {
          entity_id: e.id,
          name,
          job_title: attrs.job_title ?? (ctx.job_title as string | null) ?? null,
          avatar_url: e.avatar_url ?? null,
          is_ghost: e.claimed_by_user_id == null,
          employment_status: (ctx.employment_status as 'internal_employee' | 'external_contractor' | null) ?? null,
          skills: crewSkillsByEntityId.get(e.id) ?? [],
          equipment: crewEquipmentByEntityId.get(e.id) ?? [],
          _section: 'team' as const,
        };
      });
    }

    const teamEntityIdSet = new Set(rosterEntityIds);

    // ── 3. Workspace member user IDs — for network deduplication ─────────────
    // A person entity claimed by an existing workspace member should never appear
    // under "Network" — they're already part of the team in some capacity.
    // This handles the case where a roster ghost entity and a separately claimed
    // account entity belong to the same real person (ghost has no claimed_by_user_id
    // so rosterUserIds alone can't catch the duplicate).
    const { data: wsMemberRows } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    const workspaceMemberUserIds = new Set<string>(
      (wsMemberRows ?? []).map((m) => m.user_id).filter(Boolean) as string[]
    );

    // ── 4. Inner-circle: PARTNER/VENDOR/CLIENT edges from org with tier='preferred' ──
    // Only show people the workspace has explicitly flagged as preferred partners —
    // not the full workspace person graph (which contains clients, venues, etc.).
    const { data: partnerRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id, context_data')
      .eq('source_entity_id', orgEnt.id)
      .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT']);

    const innerCircleEntityIds = (partnerRels ?? [])
      .filter((r) => {
        const ctx = (r.context_data as Record<string, unknown>) ?? {};
        return ctx.tier === 'preferred' && !ctx.deleted_at;
      })
      .map((r) => r.target_entity_id)
      .filter((id) => !teamEntityIdSet.has(id));

    let networkResults: CrewSearchResult[] = [];
    if (innerCircleEntityIds.length > 0) {
      // Fetch entities and their crew skills in parallel
      let networkEntitiesQuery = supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
        .in('id', innerCircleEntityIds)
        .eq('type', 'person');
      if (q) networkEntitiesQuery = networkEntitiesQuery.ilike('display_name', `%${q}%`);

      const [networkEntResult, networkSkillsResult] = await Promise.all([
        networkEntitiesQuery.limit(20),
        supabase
          .schema('ops')
          .from('crew_skills')
          .select('entity_id, skill_tag')
          .in('entity_id', innerCircleEntityIds)
          .eq('workspace_id', workspaceId),
      ]);

      const networkSkillsByEntityId = new Map<string, string[]>();
      for (const row of networkSkillsResult.data ?? []) {
        const list = networkSkillsByEntityId.get(row.entity_id) ?? [];
        list.push(row.skill_tag);
        networkSkillsByEntityId.set(row.entity_id, list);
      }

      networkResults = (networkEntResult.data ?? [])
        .filter((e) => {
          if (e.claimed_by_user_id && workspaceMemberUserIds.has(e.claimed_by_user_id)) return false;
          if (!hasRoleFilter) return true;
          const skills = (networkSkillsByEntityId.get(e.id) ?? []).map((s) => s.toLowerCase());
          return skills.some((s) => s.includes(roleLower) || roleLower.includes(s));
        })
        .slice(0, 5)
        .map((e) => {
          const attrs = readEntityAttrs(e.attributes, 'person');
          const name =
            [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() ||
            e.display_name;
          return {
            entity_id: e.id,
            name,
            job_title: attrs.job_title ?? null,
            avatar_url: e.avatar_url ?? null,
            is_ghost: e.claimed_by_user_id == null,
            employment_status: null,
            skills: networkSkillsByEntityId.get(e.id) ?? [],
            equipment: [],  // Network results don't include equipment (workspace-scoped)
            _section: 'network' as const,
          };
        });
    }

    return [...teamResults.slice(0, 10), ...networkResults];
  });
}

export async function listDealRoster(dealId: string): Promise<CrewSearchResult[]> {
  return instrument('listDealRoster', async () => {
    const parsed = z.string().uuid().safeParse(dealId);
    if (!parsed.success) return [];

    const activeWsRaw = await getActiveWorkspaceId();
    if (!activeWsRaw) return [];

    const supabase = await createClient();

    const { data: dealRow } = await supabase
      .from('deals')
      .select('workspace_id')
      .eq('id', dealId)
      .maybeSingle();

    const workspaceId = (dealRow as { workspace_id?: string } | null)?.workspace_id;
    if (!workspaceId || workspaceId !== activeWsRaw) return [];

    // Resolve the workspace's HQ company entity. legacy_org_id ≠ workspace_id
    // for workspaces created after the org→workspace split, so we can't use the
    // legacy_org_id shortcut. Instead: find a workspace member's entity, follow
    // their MEMBER/ROSTER_MEMBER edge to the HQ. Fall back to any company entity
    // owned by the workspace if no edge exists.
    const { data: wsMemberRows0 } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    const memberUserIds = (wsMemberRows0 ?? []).map((m) => m.user_id).filter(Boolean) as string[];

    let orgEntId: string | null = null;
    if (memberUserIds.length > 0) {
      const { data: memberEntities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id')
        .in('claimed_by_user_id', memberUserIds);
      const memberEntityIds = (memberEntities ?? []).map((e) => e.id);
      if (memberEntityIds.length > 0) {
        const { data: hqEdges } = await supabase
          .schema('cortex')
          .from('relationships')
          .select('target_entity_id')
          .in('source_entity_id', memberEntityIds)
          .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']);
        if (hqEdges?.length) {
          // If members belong to multiple orgs, prefer one owned by this workspace.
          const targetIds = [...new Set(hqEdges.map((r) => r.target_entity_id))];
          const { data: ownedHq } = await supabase
            .schema('directory')
            .from('entities')
            .select('id')
            .in('id', targetIds)
            .eq('owner_workspace_id', workspaceId)
            .limit(1)
            .maybeSingle();
          orgEntId = (ownedHq as { id: string } | null)?.id ?? targetIds[0];
        }
      }
    }
    if (!orgEntId) {
      const { data: fallback } = await supabase
        .schema('directory')
        .from('entities')
        .select('id')
        .eq('owner_workspace_id', workspaceId)
        .eq('type', 'company')
        .limit(1)
        .maybeSingle();
      orgEntId = (fallback as { id: string } | null)?.id ?? null;
    }
    if (!orgEntId) return [];
    const orgEnt = { id: orgEntId };

    const { data: rosterRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('source_entity_id, context_data')
      .eq('target_entity_id', orgEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER');

    const activeRosterRels = (rosterRels ?? []).filter(
      (r) => !(r.context_data as Record<string, unknown>)?.deleted_at,
    );
    const rosterEntityIds = activeRosterRels.map((r) => r.source_entity_id);
    const rosterCtxById = new Map(
      activeRosterRels.map((r) => [r.source_entity_id, r.context_data as Record<string, unknown>]),
    );

    let teamResults: CrewSearchResult[] = [];
    if (rosterEntityIds.length > 0) {
      const [rosterEntResult, crewSkillsResult, crewEquipmentResult] = await Promise.all([
        supabase
          .schema('directory')
          .from('entities')
          .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
          .in('id', rosterEntityIds),
        supabase
          .schema('ops')
          .from('crew_skills')
          .select('entity_id, skill_tag')
          .in('entity_id', rosterEntityIds)
          .eq('workspace_id', workspaceId),
        supabase
          .schema('ops')
          .from('crew_equipment')
          .select('entity_id, name')
          .in('entity_id', rosterEntityIds)
          .eq('workspace_id', workspaceId),
      ]);

      const skillsByEntityId = new Map<string, string[]>();
      for (const row of crewSkillsResult.data ?? []) {
        const list = skillsByEntityId.get(row.entity_id) ?? [];
        list.push(row.skill_tag);
        skillsByEntityId.set(row.entity_id, list);
      }
      const equipmentByEntityId = new Map<string, string[]>();
      for (const row of crewEquipmentResult.data ?? []) {
        const list = equipmentByEntityId.get(row.entity_id) ?? [];
        list.push(row.name);
        equipmentByEntityId.set(row.entity_id, list);
      }

      teamResults = (rosterEntResult.data ?? []).map((e) => {
        const attrs = readEntityAttrs(e.attributes, 'person');
        const ctx = rosterCtxById.get(e.id) ?? {};
        const name =
          [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() ||
          e.display_name;
        return {
          entity_id: e.id,
          name,
          job_title: attrs.job_title ?? (ctx.job_title as string | null) ?? null,
          avatar_url: e.avatar_url ?? null,
          is_ghost: e.claimed_by_user_id == null,
          employment_status:
            (ctx.employment_status as 'internal_employee' | 'external_contractor' | null) ?? null,
          skills: skillsByEntityId.get(e.id) ?? [],
          equipment: equipmentByEntityId.get(e.id) ?? [],
          _section: 'team' as const,
        };
      });
    }

    return teamResults;
  });
}
