/**
 * Talent entity – Skills-based junction types (Holographic Roster).
 * Aligns with talent_skills + org_members.
 * talent_skills table not in generated Database type; use local row shapes.
 */

import type { Database } from '@/types/supabase';

export type EmploymentStatus = 'internal_employee' | 'external_contractor';
export type SkillLevel = Database['public']['Enums']['skill_level'];
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member' | 'restricted';

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

/**
 * @deprecated Use CrewSkillDTO instead. Backed by public.talent_skills (dead org_member_id key).
 * Migrate callers to ops.crew_skills via getCrewSkillsForEntity.
 *
 * Skill node for display (e.g. badge under member name). */
export interface TalentSkillDTO {
  id: string;
  skill_tag: string;
  proficiency: SkillLevel;
  hourly_rate: number | null;
  verified: boolean;
}

/** Skill record from ops.crew_skills — replaces TalentSkillDTO for new code. */
export interface CrewSkillDTO {
  id: string;
  skill_tag: string;
  proficiency: SkillLevel | null;
  hourly_rate: number | null;
  verified: boolean;
  notes?: string | null;
}

/** Equipment category for ops.crew_equipment. */
export type EquipmentCategory = 'audio' | 'lighting' | 'video' | 'staging' | 'power' | 'misc';

export type EquipmentVerificationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Equipment record from ops.crew_equipment — Phase 2 crew gear profiles + Verified Kit System. */
export interface CrewEquipmentDTO {
  id: string;
  category: EquipmentCategory;
  name: string;
  quantity: number;
  notes: string | null;
  catalog_item_id: string | null;
  verification_status: EquipmentVerificationStatus;
  photo_url: string | null;
}

/** Org member with skills (expanded card). Ghost members have profile_id null. */
export interface OrgMemberWithSkillsDTO {
  id: string;
  /** directory.entities.id for the person entity — used for ops.crew_skills lookups. */
  entity_id: string | null;
  profile_id: string | null;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  role: OrgMemberRole;
  default_hourly_rate: number;
  /**
   * @deprecated Legacy skills from public.talent_skills. Use getCrewSkillsForEntity() instead.
   * Kept for backward-compat with callers that haven't migrated. Do not read this field in new code.
   */
  skills: TalentSkillDTO[];
  /** From profiles join (fallback when first_name/last_name empty). */
  profiles?: { full_name: string | null; email: string | null } | null;
}
