'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { OrgMemberRosterItem } from '../model/types';

type Row = {
  id: string;
  org_id: string;
  entity_id: string | null;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  employment_status: string;
  role: string;
  /** Present only after migration 20260215000012 (org_members.avatar_url). Omit from select if column missing so roster still loads. */
  avatar_url?: string | null;
  entities: { id: string; email: string; is_ghost: boolean } | null;
  talent_skills: { skill_tag: string; proficiency?: string }[] | null;
};

/**
 * List org_members for an organization (roster), including Ghosts.
 * Uses entities!inner so every row has an entity; display name from member first_name/last_name or entity.email.
 * RLS: only admins/members of that org see the list.
 */
export async function listOrgMembers(orgId: string): Promise<OrgMemberRosterItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('org_members')
    .select(
      `
      id,
      org_id,
      entity_id,
      profile_id,
      first_name,
      last_name,
      job_title,
      employment_status,
      role,
      entities!inner (
        id,
        email,
        is_ghost
      ),
      talent_skills (
        skill_tag,
        proficiency
      )
    `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return [];

  const { data: dataWithAvatar, error: avatarError } = await supabase
    .from('org_members')
    .select('id, avatar_url')
    .eq('org_id', orgId);

  const avatarById = new Map<string, string | null>();
  if (!avatarError && dataWithAvatar) {
    for (const row of dataWithAvatar as { id: string; avatar_url?: string | null }[]) {
      avatarById.set(row.id, row.avatar_url ?? null);
    }
  }

  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r): r is Row & { entities: NonNullable<Row['entities']> } => r.entity_id != null && r.entities != null)
    .map((r) => {
      const entity = r.entities!;
      const display_name =
        [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || entity.email;
      const skill_tags = (r.talent_skills ?? []).map((s) => s.skill_tag);
      return {
        id: r.id,
        org_id: r.org_id,
        entity_id: r.entity_id!,
        profile_id: r.profile_id,
        first_name: r.first_name,
        last_name: r.last_name,
        job_title: r.job_title,
        employment_status: r.employment_status as OrgMemberRosterItem['employment_status'],
        role: r.role as OrgMemberRosterItem['role'],
        email: entity.email,
        is_ghost: entity.is_ghost,
        display_name,
        skill_tags,
        avatar_url: avatarById.get(r.id) ?? (r as Row).avatar_url ?? null,
      };
    });
}
