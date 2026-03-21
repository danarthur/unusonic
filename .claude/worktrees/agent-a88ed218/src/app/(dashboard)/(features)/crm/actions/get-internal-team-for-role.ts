'use server';

import { getCurrentOrgId } from '@/features/network/api/actions';
import { listOrgMembers } from '@/entities/organization';

export type InternalTeamMember = {
  id: string;
  entity_id: string;
  name: string;
  job_title: string | null;
  skill_tags: string[];
};

/**
 * Returns internal team (current org roster) filtered by role.
 * Matches crew role (e.g. "DJ") against skill_tag and job_title (case-insensitive).
 * If no matches, returns full roster so user can still assign.
 */
export async function getInternalTeamForRole(
  role: string
): Promise<{ members: InternalTeamMember[]; orgId: string | null }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { members: [], orgId: null };

  const roster = await listOrgMembers(orgId);
  const roleLower = role.trim().toLowerCase();
  const matchesRole = (m: (typeof roster)[0]) => {
    if (!roleLower) return true;
    const jobMatch = m.job_title?.toLowerCase().includes(roleLower);
    const skillMatch = m.skill_tags.some((t) => t.toLowerCase().includes(roleLower) || roleLower.includes(t.toLowerCase()));
    return !!jobMatch || !!skillMatch;
  };

  const filtered = roleLower ? roster.filter(matchesRole) : roster;
  const members: InternalTeamMember[] = (filtered.length > 0 ? filtered : roster).map((m) => ({
    id: m.id,
    entity_id: m.entity_id,
    name: m.display_name || [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.email,
    job_title: m.job_title ?? null,
    skill_tags: m.skill_tags ?? [],
  }));

  return { members, orgId };
}
