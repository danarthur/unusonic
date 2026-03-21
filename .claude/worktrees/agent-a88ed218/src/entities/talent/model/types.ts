/**
 * Talent entity – Skills-based junction types (Holographic Roster).
 * Aligns with talent_skills + org_members.
 * talent_skills table not in generated Database type; use local row shapes.
 */

import type { Database } from '@/types/supabase';

export type EmploymentStatus = Database['public']['Enums']['employment_status'];
export type SkillLevel = Database['public']['Enums']['skill_level'];
export type OrgMemberRole = Database['public']['Enums']['org_member_role'];

export interface TalentSkillRow {
  id: string;
  org_member_id: string;
  skill_tag: string;
  proficiency?: SkillLevel | null;
  hourly_rate?: number | null;
  verified?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export type TalentSkillInsert = Partial<TalentSkillRow> & Pick<TalentSkillRow, 'org_member_id' | 'skill_tag'>;
export type TalentSkillUpdate = Partial<Omit<TalentSkillRow, 'id'>>;

// Legacy row shapes (org_members table dropped in Session 10; kept for backward compat)
export interface OrgMemberRow {
  id: string;
  org_id: string;
  profile_id: string | null;
  entity_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  role: OrgMemberRole;
  default_hourly_rate: number;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export type OrgMemberInsert = Partial<OrgMemberRow> & { org_id: string };
export type OrgMemberUpdate = Partial<OrgMemberRow>;

/** Skill node for display (e.g. badge under member name). */
export interface TalentSkillDTO {
  id: string;
  skill_tag: string;
  proficiency: SkillLevel;
  hourly_rate: number | null;
  verified: boolean;
}

/** Org member with skills (expanded card). Ghost members have profile_id null. */
export interface OrgMemberWithSkillsDTO {
  id: string;
  profile_id: string | null;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  role: OrgMemberRole;
  default_hourly_rate: number;
  skills: TalentSkillDTO[];
  /** From profiles join (fallback when first_name/last_name empty). */
  profiles?: { full_name: string | null; email: string | null } | null;
}
