/**
 * Talent entity – Skills-based junction types (Holographic Roster).
 * Aligns with talent_skills + org_members.
 * talent_skills table not in generated Database type; use local row shapes.
 */

import type { Database } from '@/types/supabase';

export type EmploymentStatus = 'internal_employee' | 'external_contractor';
export type SkillLevel = Database['public']['Enums']['skill_level'];
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member' | 'restricted';

/*
  TalentSkillRow, TalentSkillInsert and TalentSkillUpdate stood here, describing
  `public.talent_skills` keyed on `org_member_id`. That table does not exist --
  skills are `ops.crew_skills`, keyed on the person's entity id -- so these were
  the shape of nothing. CrewSkillDTO below is the row that is really stored.
*/

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
/*
  TalentSkillDTO stood here, describing a row of `public.talent_skills`. That
  table does not exist; skills live in `ops.crew_skills`, keyed by the person's
  entity id rather than a legacy org_member_id. CrewSkillDTO is that row, and
  is now the only one.
*/

/** Skill record from ops.crew_skills. */
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
  skills: CrewSkillDTO[];
  /** From profiles join (fallback when first_name/last_name empty). */
  profiles?: { full_name: string | null; email: string | null } | null;
}
